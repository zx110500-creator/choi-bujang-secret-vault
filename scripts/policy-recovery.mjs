import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const baselineCommit = '068d193d049ee6c1b299d98c75d2513fe5982f96';
const backupRoot = join(root, 'backups', 'policy-baseline-9');
const policyFiles = ['src/decider.mjs', 'aleph.config.json'];

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function baselineContents(path) {
  return execFileSync('git', ['-C', root, 'show', `${baselineCommit}:${path}`], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

function baselineManifest() {
  const files = Object.fromEntries(policyFiles.map(path => [
    path,
    hash(baselineContents(path)),
  ]));
  return {
    schema: 'aleph.policy-backup.v1',
    baselineCommit,
    files,
    databasePolicyStatus: 'not_present_in_repository',
    databasePolicyFiles: [],
  };
}

function writeBackupFromBaseline() {
  mkdirSync(backupRoot, { recursive: true });
  for (const path of policyFiles) {
    const output = join(backupRoot, path);
    mkdirSync(join(output, '..'), { recursive: true });
    writeFileSync(output, baselineContents(path), 'utf8');
  }
  writeFileSync(join(backupRoot, 'manifest.json'), `${JSON.stringify(baselineManifest(), null, 2)}\n`, 'utf8');
}

function makeDiff(before, after, label) {
  if (before === after) return `${label}: 변경 없음\n`;
  const directory = mkdtempSync(join(tmpdir(), 'aleph-policy-diff-'));
  const beforePath = join(directory, 'before');
  const afterPath = join(directory, 'after');
  writeFileSync(beforePath, before, 'utf8');
  writeFileSync(afterPath, after, 'utf8');
  try {
    const diff = execFileSync('git', [
      '-c', 'core.autocrlf=false', 'diff', '--no-index', '--no-ext-diff',
      '--', beforePath, afterPath,
    ], { encoding: 'utf8', windowsHide: true });
    return `${label}\n${diff}`;
  } catch (error) {
    if (error.status === 1) return `${label}\n${error.stdout}`;
    throw error;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function createBackup() {
  if (existsSync(backupRoot)) throw new Error('policy_backup_already_exists');
  writeBackupFromBaseline();
  process.stdout.write(`정책 백업 생성: ${relative(root, backupRoot)}\n`);
}

function verifyBackup() {
  const manifestPath = join(backupRoot, 'manifest.json');
  const expectedManifest = baselineManifest();
  if (!existsSync(manifestPath)) {
    process.stdout.write(makeDiff(`${JSON.stringify(expectedManifest, null, 2)}\n`, '', 'manifest missing'));
    for (const path of policyFiles) {
      process.stdout.write(makeDiff(baselineContents(path), '', `${path} backup missing`));
    }
    throw new Error('policy_backup_or_manifest_missing');
  }
  const manifestText = readFileSync(manifestPath, 'utf8');
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    process.stdout.write(makeDiff(`${JSON.stringify(expectedManifest, null, 2)}\n`, manifestText, 'manifest invalid'));
    throw new Error('policy_backup_manifest_invalid');
  }
  if (manifest.schema !== 'aleph.policy-backup.v1'
      || manifest.baselineCommit !== baselineCommit
      || manifest.databasePolicyStatus !== 'not_present_in_repository'
      || !Array.isArray(manifest.databasePolicyFiles)
      || manifest.databasePolicyFiles.length !== 0
      || !manifest.files
      || Object.keys(manifest).sort().join(',') !== Object.keys(expectedManifest).sort().join(',')
      || Object.keys(manifest.files).sort().join(',') !== policyFiles.slice().sort().join(',')) {
    process.stdout.write(makeDiff(`${JSON.stringify(expectedManifest, null, 2)}\n`, manifestText, 'manifest vs pinned baseline'));
    throw new Error('policy_backup_manifest_invalid');
  }
  for (const path of policyFiles) {
    const backupPath = join(backupRoot, path);
    const baseline = baselineContents(path);
    const expectedHash = hash(baseline);
    if (!existsSync(backupPath)) {
      process.stdout.write(makeDiff(baseline, '', `${path} backup missing`));
      throw new Error('policy_backup_file_missing');
    }
    const saved = readFileSync(backupPath, 'utf8');
    if (manifest.files[path] !== expectedHash || hash(saved) !== expectedHash) {
      process.stdout.write(makeDiff(baseline, saved, `${path} backup vs pinned baseline`));
      throw new Error('policy_backup_hash_mismatch');
    }
  }
  process.stdout.write('정책 백업 SHA-256 검증 통과: pinned 9단계 커밋과 일치합니다.\n');
  process.stdout.write('DB 정책 SQL 백업 없음: 저장소에서 SQL/마이그레이션을 찾지 못했습니다.\n');
}

function restorePolicy(apply) {
  verifyBackup();
  const restored = new Map();
  for (const path of policyFiles) {
    let contents = readFileSync(join(backupRoot, path), 'utf8');
    if (path === 'aleph.config.json') {
      const config = JSON.parse(contents);
      config.step = 10;
      config.restoreRoute = '/api/admin/restore-note';
      contents = `${JSON.stringify(config, null, 2)}\n`;
    }
    restored.set(path, contents);
  }

  process.stdout.write('복원 전 diff:\n');
  for (const path of policyFiles) {
    process.stdout.write(makeDiff(
      readFileSync(join(root, path), 'utf8'),
      restored.get(path),
      path,
    ));
  }
  if (!apply) {
    process.stdout.write('계획만 표시했습니다. 실제 운영 파일은 변경하지 않았습니다. 적용하려면 --apply를 추가하세요.\n');
    return;
  }
  for (const [path, contents] of restored) {
    writeFileSync(join(root, path), contents, 'utf8');
  }
  process.stdout.write('검증된 사본으로 로컬 정책 파일을 복원했습니다. 배포된 운영 정책은 변경하지 않았습니다.\n');
}

const command = process.argv[2];
try {
  if (command === 'create') createBackup();
  else if (command === 'verify') verifyBackup();
  else if (command === 'restore') restorePolicy(process.argv.includes('--apply'));
  else throw new Error('usage: node scripts/policy-recovery.mjs <create|verify|restore [--apply]>');
} catch (error) {
  process.stderr.write(`정책 복구 첫 오류: ${error.message}\n`);
  process.exitCode = 1;
}

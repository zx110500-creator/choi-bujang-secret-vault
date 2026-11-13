import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';
import { assertNoSupabaseCredentialsInPublic } from './public-assets.mjs';

const root = resolve(import.meta.dirname, '..');
const publicDir = resolve(root, 'public');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
assertNoSupabaseCredentialsInPublic(publicDir);
if (!Number.isInteger(config.step) || config.step < 2) {
  throw new Error('2단계 이후 단계 설정이 필요합니다.');
}
await mkdir(publicDir, { recursive: true });
await rm(resolve(publicDir, 'data.json'), { force: true });
console.log('public/data.json을 만들지 않았습니다. 자료는 API를 통해 서버에서 읽습니다.');
if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(resolve(publicDir, 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}

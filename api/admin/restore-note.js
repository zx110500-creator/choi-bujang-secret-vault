import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../../src/verify-login.mjs';
import { readSessionCookies } from '../../src/auth-session.mjs';
import config from '../../aleph.config.json' with { type: 'json' };

const NOTE_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u;
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const BACKUP_KEYS = 'body,bodySha256,id,owner_id,title';

let verifyLoginAuthorization = null;
function getVerifier() {
  if (!verifyLoginAuthorization) {
    verifyLoginAuthorization = createLoginVerifier({
      config,
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
    });
  }
  return verifyLoginAuthorization;
}

function getBackup() {
  const raw = process.env.RESTORE_NOTE_BACKUP_JSON;
  const targetId = process.env.RESTORE_NOTE_ID;
  const ownerId = process.env.RESTORE_NOTE_OWNER_ID;
  const adminId = process.env.RESTORE_ADMIN_USER_ID;
  if (!raw || !targetId || !ownerId || !adminId) return null;
  if (raw.length > 200000 || !NOTE_ID.test(targetId)
      || !USER_ID.test(ownerId) || !USER_ID.test(adminId)) return null;

  let backup;
  try {
    backup = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)
      || Object.keys(backup).sort().join(',') !== BACKUP_KEYS
      || backup.id !== targetId || backup.owner_id !== ownerId
      || typeof backup.title !== 'string' || typeof backup.body !== 'string'
      || typeof backup.bodySha256 !== 'string'
      || !/^[a-f0-9]{64}$/u.test(backup.bodySha256)) return null;
  const digest = createHash('sha256').update(backup.body, 'utf8').digest('hex');
  if (digest !== backup.bodySha256) return null;
  return { backup, adminId };
}

function hasUnexpectedRequestData(request) {
  if (typeof request.url === 'string' && request.url.includes('?')) return true;
  const body = request.body;
  return body !== undefined && body !== null
    && (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0);
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }
  if (hasUnexpectedRequestData(request)) {
    response.status(400).json({ error: 'RESTORE_REQUEST_MUST_BE_EMPTY' });
    return;
  }

  const restore = getBackup();
  if (!restore) {
    response.status(503).json({ error: 'RESTORE_NOT_CONFIGURED' });
    return;
  }

  const accessToken = readSessionCookies(request).accessToken;
  const authHeader = accessToken
    ? `Bearer ${accessToken}`
    : request.headers?.authorization ?? request.headers?.Authorization ?? '';
  if (!authHeader) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    response.status(503).json({ error: 'SUPABASE_NOT_CONFIGURED' });
    return;
  }

  let verified;
  try {
    verified = await getVerifier()(authHeader);
  } catch {
    response.status(500).json({ error: 'AUTH_VERIFIER_ERROR' });
    return;
  }
  if (!verified?.userId) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (verified.userId !== restore.adminId) {
    response.status(403).json({ error: 'RESTORE_ADMIN_REQUIRED' });
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { backup } = restore;
    const { data: existingRows, error: readError } = await supabase
      .from('notes')
      .select('id, owner_id')
      .eq('id', backup.id)
      .limit(1);
    if (readError) {
      response.status(500).json({ error: 'RESTORE_TARGET_READ_FAILED' });
      return;
    }
    const existing = existingRows?.[0] ?? null;
    if (existing && existing.owner_id !== backup.owner_id) {
      response.status(409).json({ error: 'RESTORE_TARGET_OWNER_MISMATCH' });
      return;
    }

    if (existing) {
      const { data, error } = await supabase
        .from('notes')
        .update({ title: backup.title, body: backup.body })
        .eq('id', backup.id)
        .eq('owner_id', backup.owner_id)
        .select('id')
        .maybeSingle();
      if (error) {
        response.status(500).json({ error: 'RESTORE_UPDATE_FAILED' });
        return;
      }
      if (!data) {
        response.status(409).json({ error: 'RESTORE_TARGET_CHANGED' });
        return;
      }
    } else {
      const { error } = await supabase
        .from('notes')
        .insert({
          id: backup.id,
          owner_id: backup.owner_id,
          title: backup.title,
          body: backup.body,
        });
      if (error) {
        response.status(500).json({ error: 'RESTORE_INSERT_FAILED' });
        return;
      }
    }
    response.status(200).json({ restored: true });
  } catch {
    response.status(500).json({ error: 'RESTORE_FAILED' });
  }
}

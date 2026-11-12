import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';

const config = JSON.parse(
  readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8')
);

let verifyLoginAuthorization = null;
function getVerifier() {
  if (!verifyLoginAuthorization) {
    verifyLoginAuthorization = createLoginVerifier({
      config,
      supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
    });
  }
  return verifyLoginAuthorization;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    response.status(500).json({ error: 'SUPABASE_NOT_CONFIGURED' });
    return;
  }

  // 1. Authorization 헤더의 Bearer 토큰을 verify-login.mjs로 검증
  const authHeader =
    request.headers?.authorization ?? request.headers?.Authorization ?? '';
  let verified = null;
  try {
    const verify = getVerifier();
    verified = await verify(authHeader);
  } catch (_err) {
    response.status(500).json({ error: 'AUTH_VERIFIER_ERROR' });
    return;
  }

  // 2. 토큰이 없거나 유효하지 않으면 메모 없이 401 JSON 반환
  if (!verified || !verified.userId) {
    response.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  // 3. 쿼리·헤더의 userId, owner_id, role은 무시하고 verified.userId만 사용
  try {
    const supabase = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from('notes')
      .select('id, title, body')
      .eq('owner_id', verified.userId);

    if (error) {
      response.status(500).json({ error: 'NOTES_READ_FAILED' });
      return;
    }

    response.status(200).json({ notes: data ?? [] });
  } catch (_error) {
    response.status(500).json({ error: 'NOTES_READ_FAILED' });
  }
}
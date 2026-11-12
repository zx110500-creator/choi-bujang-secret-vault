import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import config from '../aleph.config.json' with { type: 'json' };

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

  if (request.method !== 'GET') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    response.status(500).json({ error: 'SUPABASE_NOT_CONFIGURED' });
    return;
  }

  const authHeader =
    request.headers?.authorization ?? request.headers?.Authorization ?? '';
  let verified = null;
  try {
    verified = await getVerifier()(authHeader);
  } catch (_error) {
    response.status(500).json({ error: 'AUTH_VERIFIER_ERROR' });
    return;
  }

  if (!verified?.userId) {
    response.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

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

import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../../src/verify-login.mjs';
import { readSessionCookies } from '../../src/auth-session.mjs';
import config from '../../aleph.config.json' with { type: 'json' };

const NOTE_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u;

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

function forbidden(response) {
  response.status(403).json({ error: 'Forbidden', reason: 'note_not_owned' });
}

function getNoteId(request) {
  const id = request.query?.id;
  if (typeof request.url === 'string' && request.url.includes('?')) return null;
  if (typeof id !== 'string' || !NOTE_ID.test(id) || id.toLowerCase() === 'export') return null;
  return id;
}

function getPatch(request) {
  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (!keys.length || keys.some(key => !['title', 'body'].includes(key))
      || keys.some(key => typeof body[key] !== 'string')) {
    return null;
  }
  return body;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'PATCH', 'DELETE'].includes(request.method)) {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const id = getNoteId(request);
  if (!id) {
    response.status(400).json({ error: 'INVALID_NOTE_ID' });
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
    response.status(500).json({ error: 'SUPABASE_NOT_CONFIGURED' });
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

  try {
    const supabase = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: note, error: readError } = await supabase
      .from('notes')
      .select('id, owner_id, title, body')
      .eq('id', id)
      .maybeSingle();

    if (readError) {
      response.status(500).json({ error: 'NOTES_READ_FAILED' });
      return;
    }
    if (!note) {
      response.status(404).json({ error: 'NOTE_NOT_FOUND' });
      return;
    }
    if (note.owner_id !== verified.userId) {
      forbidden(response);
      return;
    }

    if (request.method === 'GET') {
      response.status(200).json({
        note: { id: note.id, title: note.title, body: note.body },
      });
      return;
    }

    if (request.method === 'PATCH') {
      const patch = getPatch(request);
      if (!patch) {
        response.status(400).json({ error: 'INVALID_NOTE_UPDATE' });
        return;
      }
      const { data, error } = await supabase
        .from('notes')
        .update(patch)
        .eq('id', id)
        .eq('owner_id', verified.userId)
        .select('id, title, body')
        .maybeSingle();
      if (error) {
        response.status(500).json({ error: 'NOTES_UPDATE_FAILED' });
        return;
      }
      if (!data) {
        forbidden(response);
        return;
      }
      response.status(200).json({ note: data });
      return;
    }

    const { data, error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id)
      .eq('owner_id', verified.userId)
      .select('id')
      .maybeSingle();
    if (error) {
      response.status(500).json({ error: 'NOTES_DELETE_FAILED' });
      return;
    }
    if (!data) {
      forbidden(response);
      return;
    }
    response.status(200).json({ deleted: true });
  } catch {
    response.status(500).json({ error: 'NOTES_REQUEST_FAILED' });
  }
}

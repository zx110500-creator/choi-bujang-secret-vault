import {
  clearSessionCookies,
  getSupabaseAuthSettings,
  readSessionCookies,
  refreshSupabaseSession,
  setSessionCookies,
  verifySessionAccessToken,
} from '../../src/auth-session.mjs';

function unauthorized(response, clearCookies = false) {
  if (clearCookies) clearSessionCookies(response);
  response.status(401).json({ error: 'Unauthorized' });
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const cookies = readSessionCookies(request);
  if (!cookies.accessToken && !cookies.refreshToken) {
    unauthorized(response);
    return;
  }

  if (cookies.accessToken) {
    let verified;
    try {
      verified = await verifySessionAccessToken(cookies.accessToken);
    } catch {
      response.status(500).json({ error: 'AUTH_VERIFIER_ERROR' });
      return;
    }
    if (verified?.userId) {
      response.status(200).json({ authenticated: true });
      return;
    }
  }

  if (!cookies.refreshToken) {
    unauthorized(response, true);
    return;
  }

  let settings;
  try {
    settings = getSupabaseAuthSettings();
  } catch {
    response.status(500).json({ error: 'SUPABASE_NOT_CONFIGURED' });
    return;
  }

  let session;
  try {
    session = await refreshSupabaseSession(settings, cookies.refreshToken);
  } catch (error) {
    const code = error.message === 'auth_provider_response_invalid'
      ? 'AUTH_PROVIDER_RESPONSE_INVALID'
      : 'AUTH_PROVIDER_UNAVAILABLE';
    response.status(502).json({ error: code });
    return;
  }
  if (!session) {
    unauthorized(response, true);
    return;
  }

  let verified;
  try {
    verified = await verifySessionAccessToken(session.access_token);
  } catch {
    response.status(500).json({ error: 'AUTH_VERIFIER_ERROR' });
    return;
  }
  if (!verified?.userId) {
    unauthorized(response, true);
    return;
  }
  try {
    setSessionCookies(response, session);
  } catch {
    response.status(502).json({ error: 'AUTH_PROVIDER_RESPONSE_INVALID' });
    return;
  }
  response.status(200).json({ authenticated: true });
}

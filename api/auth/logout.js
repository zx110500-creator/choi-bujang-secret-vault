import {
  clearSessionCookies,
  getSupabaseAuthSettings,
  readSessionCookies,
  refreshSupabaseSession,
  requestSupabaseAuth,
} from '../../src/auth-session.mjs';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }
  clearSessionCookies(response);

  const cookies = readSessionCookies(request);
  if (!cookies.accessToken && !cookies.refreshToken) {
    response.status(200).json({ authenticated: false });
    return;
  }

  let settings;
  try {
    settings = getSupabaseAuthSettings();
  } catch {
    response.status(500).json({ error: 'SUPABASE_NOT_CONFIGURED' });
    return;
  }

  let accessToken = cookies.accessToken;
  if (accessToken) {
    let logoutResponse;
    try {
      logoutResponse = await requestSupabaseAuth(settings, 'logout', {
        method: 'POST',
        accessToken,
      });
    } catch {
      response.status(502).json({ error: 'AUTH_PROVIDER_UNAVAILABLE' });
      return;
    }
    if (logoutResponse.ok) {
      response.status(200).json({ authenticated: false });
      return;
    }
    if (logoutResponse.status !== 400 && logoutResponse.status !== 401
        && logoutResponse.status !== 403) {
      response.status(502).json({ error: 'AUTH_PROVIDER_UNAVAILABLE' });
      return;
    }
    if (!cookies.refreshToken) {
      response.status(200).json({ authenticated: false });
      return;
    }
  }

  if (!accessToken && !cookies.refreshToken) {
    response.status(200).json({ authenticated: false });
    return;
  }

  if (cookies.refreshToken) {
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
      response.status(200).json({ authenticated: false });
      return;
    }
    accessToken = session.access_token;
  }

  if (!accessToken) {
    response.status(502).json({ error: 'AUTH_PROVIDER_RESPONSE_INVALID' });
    return;
  }

  let logoutResponse;
  try {
    logoutResponse = await requestSupabaseAuth(settings, 'logout', {
      method: 'POST',
      accessToken,
    });
  } catch {
    response.status(502).json({ error: 'AUTH_PROVIDER_UNAVAILABLE' });
    return;
  }
  if (logoutResponse.status === 400 || logoutResponse.status === 401
      || logoutResponse.status === 403 || logoutResponse.ok) {
    response.status(200).json({ authenticated: false });
    return;
  }
  response.status(502).json({ error: 'AUTH_PROVIDER_UNAVAILABLE' });
}

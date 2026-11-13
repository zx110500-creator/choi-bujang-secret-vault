import {
  getSupabaseAuthSettings,
  readAuthResponse,
  requestSupabaseAuth,
  setSessionCookies,
} from '../../src/auth-session.mjs';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const contentType = request.headers?.['content-type'] ?? request.headers?.['Content-Type'] ?? '';
  if (typeof contentType !== 'string' || !contentType.toLowerCase().startsWith('application/json')) {
    response.status(415).json({ error: 'JSON_REQUIRED' });
    return;
  }

  const { email, password } = request.body ?? {};
  if (typeof email !== 'string' || !email.trim() || email.length > 320
      || typeof password !== 'string' || !password || password.length > 1024) {
    response.status(400).json({ error: 'INVALID_CREDENTIALS' });
    return;
  }

  let settings;
  try {
    settings = getSupabaseAuthSettings();
  } catch {
    response.status(500).json({ error: 'SUPABASE_NOT_CONFIGURED' });
    return;
  }

  let providerResponse;
  try {
    providerResponse = await requestSupabaseAuth(settings, 'token?grant_type=password', {
      body: { email: email.trim(), password },
    });
  } catch {
    response.status(502).json({ error: 'AUTH_PROVIDER_UNAVAILABLE' });
    return;
  }

  if (providerResponse.status === 400 || providerResponse.status === 401) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!providerResponse.ok) {
    response.status(502).json({ error: 'AUTH_PROVIDER_UNAVAILABLE' });
    return;
  }

  const session = await readAuthResponse(providerResponse);
  try {
    setSessionCookies(response, session);
  } catch {
    response.status(502).json({ error: 'AUTH_PROVIDER_RESPONSE_INVALID' });
    return;
  }
  response.status(200).json({ authenticated: true });
}

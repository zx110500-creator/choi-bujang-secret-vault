import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';

const ACCESS_COOKIE = '__Host-aleph-access';
const REFRESH_COOKIE = '__Host-aleph-refresh';

let loginVerifier;

export function readSessionCookies(request) {
  const header = request.headers?.cookie ?? request.headers?.Cookie ?? '';
  const cookies = new Map();
  for (const part of (typeof header === 'string' ? header : '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    try {
      cookies.set(name, decodeURIComponent(part.slice(separator + 1).trim()));
    } catch {
      cookies.set(name, '');
    }
  }
  return {
    accessToken: cookies.get(ACCESS_COOKIE) ?? '',
    refreshToken: cookies.get(REFRESH_COOKIE) ?? '',
  };
}

export function setSessionCookies(response, session) {
  if (!isAuthSession(session)) {
    throw new TypeError('invalid_auth_session');
  }
  response.setHeader('Set-Cookie', [
    `${ACCESS_COOKIE}=${encodeURIComponent(session.access_token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${session.expires_in}`,
    `${REFRESH_COOKIE}=${encodeURIComponent(session.refresh_token)}; Path=/; HttpOnly; Secure; SameSite=Strict`,
  ]);
}

export function clearSessionCookies(response) {
  response.setHeader('Set-Cookie', [
    `${ACCESS_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    `${REFRESH_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
  ]);
}

export function getSupabaseAuthSettings() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (typeof supabaseUrl !== 'string' || !supabaseUrl.trim()
      || typeof anonKey !== 'string' || !anonKey.trim()
      || anonKey.length > 8192 || /\s/u.test(anonKey)) {
    throw new TypeError('supabase_auth_not_configured');
  }

  let url;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new TypeError('supabase_auth_not_configured');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new TypeError('supabase_auth_not_configured');
  }
  return { origin: url.origin, anonKey };
}

export function requestSupabaseAuth(settings, endpoint, {
  method = 'POST',
  accessToken,
  body,
} = {}) {
  const headers = { apikey: settings.anonKey };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(new URL(`/auth/v1/${endpoint}`, settings.origin), {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function readAuthResponse(response) {
  try {
    const data = await response.json();
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export function isAuthSession(session) {
  return typeof session?.access_token === 'string' && session.access_token.length > 0
    && typeof session.refresh_token === 'string' && session.refresh_token.length > 0
    && Number.isSafeInteger(session.expires_in) && session.expires_in > 0;
}

export async function refreshSupabaseSession(settings, refreshToken) {
  const response = await requestSupabaseAuth(settings, 'token?grant_type=refresh_token', {
    body: { refresh_token: refreshToken },
  });
  if (response.status === 400 || response.status === 401) return null;
  if (!response.ok) throw new Error('auth_provider_unavailable');
  const session = await readAuthResponse(response);
  if (!isAuthSession(session)) throw new Error('auth_provider_response_invalid');
  return session;
}

export async function verifySessionAccessToken(accessToken) {
  if (!loginVerifier) {
    loginVerifier = createLoginVerifier({
      config,
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
    });
  }
  return loginVerifier(`Bearer ${accessToken}`);
}

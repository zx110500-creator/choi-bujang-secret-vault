import { randomBytes } from 'node:crypto';

const DEVICE_COOKIE = '__Host-aleph-device';
const DEVICE_ID_PATTERN = /^[0-9a-f]{32}$/u;
const APPROVAL_STATUSES = new Set(['not_requested', 'pending', 'approved', 'revoked']);

function readCookie(request, name) {
  const header = request.headers?.cookie ?? request.headers?.Cookie ?? '';
  if (typeof header !== 'string') return '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

export function getDeviceId(request, response) {
  const current = readCookie(request, DEVICE_COOKIE);
  if (DEVICE_ID_PATTERN.test(current)) return current;

  const deviceId = randomBytes(16).toString('hex');
  response.setHeader(
    'Set-Cookie',
    `${DEVICE_COOKIE}=${deviceId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`,
  );
  return deviceId;
}

function databaseSettings() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (typeof supabaseUrl !== 'string' || typeof secretKey !== 'string'
      || !supabaseUrl.trim() || !secretKey.trim()) {
    throw new TypeError('supabase_not_configured');
  }

  const url = new URL(supabaseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new TypeError('supabase_not_configured');
  }
  return { origin: url.origin, secretKey };
}

function approvalUrl(origin, ownerId, deviceId) {
  const url = new URL('/rest/v1/device_approvals', origin);
  url.searchParams.set('select', 'status');
  url.searchParams.set('owner_id', `eq.${ownerId}`);
  url.searchParams.set('device_id', `eq.${deviceId}`);
  url.searchParams.set('limit', '1');
  return url;
}

async function readStatus(settings, ownerId, deviceId) {
  const result = await fetch(approvalUrl(settings.origin, ownerId, deviceId), {
    headers: {
      apikey: settings.secretKey,
      authorization: `Bearer ${settings.secretKey}`,
    },
    cache: 'no-store',
  });
  if (!result.ok) throw new Error('device_approval_read_failed');

  const rows = await result.json();
  if (!Array.isArray(rows) || (rows.length > 0
      && !APPROVAL_STATUSES.has(rows[0]?.status))) {
    throw new Error('device_approval_response_invalid');
  }
  return rows[0]?.status ?? 'not_requested';
}

export async function getDeviceApprovalStatus(ownerId, deviceId) {
  const settings = databaseSettings();
  return readStatus(settings, ownerId, deviceId);
}

export async function requestDeviceApproval(ownerId, deviceId) {
  const settings = databaseSettings();
  const currentStatus = await readStatus(settings, ownerId, deviceId);
  if (currentStatus !== 'not_requested') return currentStatus;

  const result = await fetch(new URL('/rest/v1/device_approvals', settings.origin), {
    method: 'POST',
    headers: {
      apikey: settings.secretKey,
      authorization: `Bearer ${settings.secretKey}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify({ owner_id: ownerId, device_id: deviceId, status: 'pending' }),
  });
  if (result.status === 409) return readStatus(settings, ownerId, deviceId);
  if (!result.ok) throw new Error('device_approval_request_failed');
  return 'pending';
}

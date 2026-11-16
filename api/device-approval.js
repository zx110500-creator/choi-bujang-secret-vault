import {
  readSessionCookies,
  verifySessionAccessToken,
} from '../src/auth-session.mjs';
import {
  getDeviceApprovalStatus,
  getDeviceId,
  requestDeviceApproval,
} from '../src/device-approval.mjs';
import { setRequestId } from '../src/request-id.mjs';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  setRequestId(response);

  if (request.method !== 'GET' && request.method !== 'POST') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const { accessToken } = readSessionCookies(request);
  if (!accessToken) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  let verified;
  try {
    verified = await verifySessionAccessToken(accessToken);
  } catch {
    response.status(500).json({ error: 'AUTH_VERIFIER_ERROR' });
    return;
  }
  if (!verified?.userId) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const deviceId = getDeviceId(request, response);
  try {
    const status = request.method === 'POST'
      ? await requestDeviceApproval(verified.userId, deviceId)
      : await getDeviceApprovalStatus(verified.userId, deviceId);
    response.status(200).json({ status });
  } catch (error) {
    const code = error instanceof TypeError && error.message === 'supabase_not_configured'
      ? 'SUPABASE_NOT_CONFIGURED'
      : 'DEVICE_APPROVAL_FAILED';
    response.status(code === 'SUPABASE_NOT_CONFIGURED' ? 500 : 502).json({ error: code });
  }
}

import { readSessionCookies, verifySessionAccessToken } from '../../src/auth-session.mjs';
import { getDeviceApprovalStatus, getDeviceId } from '../../src/device-approval.mjs';
import { RULE_IDS } from '../../src/decider.mjs';
import { setRequestId } from '../../src/request-id.mjs';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const requestId = setRequestId(response);

  if (request.method !== 'GET') {
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

  let deviceStatus;
  try {
    deviceStatus = await getDeviceApprovalStatus(
      verified.userId,
      getDeviceId(request, response),
    );
  } catch (error) {
    const code = error instanceof TypeError && error.message === 'supabase_not_configured'
      ? 'SUPABASE_NOT_CONFIGURED'
      : 'DEVICE_APPROVAL_CHECK_FAILED';
    response.status(code === 'SUPABASE_NOT_CONFIGURED' ? 500 : 502).json({ error: code });
    return;
  }

  response.status(200).json({
    requestId,
    rules: {
      source: 'src/decider.mjs',
      enforcement: 'not_wired_to_app_api',
      ids: RULE_IDS,
    },
    detection: {
      source: null,
      status: 'not_connected',
      events: [],
    },
    revocation: {
      source: 'device_approvals',
      scope: 'current_device_only',
      status: deviceStatus,
      identityRevocation: 'not_connected',
    },
    restore: {
      source: null,
      status: 'no_restore_audit_api',
      version: null,
    },
  });
}

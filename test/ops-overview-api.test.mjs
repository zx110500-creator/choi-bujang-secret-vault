import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/ops/overview.js';
import { RULE_IDS } from '../src/decider.mjs';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const DEVICE_ID = '0123456789abcdef0123456789abcdef';

function createResponse() {
  const result = { statusCode: null, body: null, headers: {} };
  return {
    result,
    setHeader(name, value) {
      result.headers[name.toLowerCase()] = value;
    },
    status(statusCode) {
      result.statusCode = statusCode;
      return this;
    },
    json(body) {
      result.body = body;
    },
  };
}

const previousFetch = globalThis.fetch;
const previousEnvironment = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
};
process.env.SUPABASE_URL = 'https://opgtqcxrirndpydbmwjv.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-server-key';
globalThis.fetch = async (input) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.pathname === '/auth/v1/user') {
    return new Response(JSON.stringify({ id: USER_ID, aud: 'authenticated' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }
  assert.equal(url.pathname, '/rest/v1/device_approvals');
  assert.equal(url.searchParams.get('device_id'), `eq.${DEVICE_ID}`);
  return new Response(JSON.stringify([{ status: 'revoked' }]), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
};

test('overview reports server rules and missing operational sources without success defaults',
  async (testContext) => {
    testContext.after(() => {
      globalThis.fetch = previousFetch;
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    const response = createResponse();
    await handler({
      method: 'GET',
      headers: {
        cookie: `__Host-aleph-access=test-access-cookie; __Host-aleph-device=${DEVICE_ID}`,
      },
    }, response);

    assert.equal(response.result.statusCode, 200);
    assert.match(response.result.headers['x-request-id'], /^[0-9a-f-]{36}$/u);
    assert.deepEqual(response.result.body.rules.ids, RULE_IDS);
    assert.equal(response.result.body.rules.enforcement, 'not_wired_to_app_api');
    assert.deepEqual(response.result.body.detection, {
      source: null,
      status: 'not_connected',
      events: [],
    });
    assert.deepEqual(response.result.body.revocation, {
      source: 'device_approvals',
      scope: 'current_device_only',
      status: 'revoked',
      identityRevocation: 'not_connected',
    });
    assert.deepEqual(response.result.body.restore, {
      source: null,
      status: 'no_restore_audit_api',
      version: null,
    });
  });

test('overview rejects requests without an authenticated session', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('anonymous overview must not contact Supabase');
  try {
    const response = createResponse();
    await handler({ method: 'GET', headers: {} }, response);
    assert.equal(response.result.statusCode, 401);
    assert.deepEqual(response.result.body, { error: 'Unauthorized' });
  } finally {
    globalThis.fetch = previous;
  }
});

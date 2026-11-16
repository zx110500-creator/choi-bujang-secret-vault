import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/device-approval.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const state = { status: null, inserts: 0 };

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
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.pathname === '/auth/v1/user') {
    return new Response(JSON.stringify({ id: USER_ID, aud: 'authenticated' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }
  assert.equal(url.pathname, '/rest/v1/device_approvals');
  if ((options.method ?? 'GET') === 'POST') {
    const record = JSON.parse(options.body);
    assert.equal(record.owner_id, USER_ID);
    assert.match(record.device_id, /^[0-9a-f]{32}$/u);
    assert.equal(record.status, 'pending');
    state.status = 'pending';
    state.inserts += 1;
    return new Response(null, { status: 201 });
  }
  return new Response(JSON.stringify(state.status ? [{ status: state.status }] : []), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
};

test('approval status and request use a server-issued HttpOnly device cookie', async (testContext) => {
  testContext.after(() => {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  state.status = null;
  state.inserts = 0;
  const initial = createResponse();
  await handler({
    method: 'GET',
    headers: { cookie: '__Host-aleph-access=test-access-cookie' },
  }, initial);

  assert.equal(initial.result.statusCode, 200);
  assert.deepEqual(initial.result.body, { status: 'not_requested' });
  const deviceCookie = initial.result.headers['set-cookie'];
  assert.match(deviceCookie, /^__Host-aleph-device=[0-9a-f]{32};/u);
  assert.match(deviceCookie, /HttpOnly; Secure; SameSite=Strict/u);

  const cookie = `__Host-aleph-access=test-access-cookie; ${deviceCookie.split(';')[0]}`;
  const requested = createResponse();
  await handler({ method: 'POST', headers: { cookie } }, requested);
  assert.equal(requested.result.statusCode, 200);
  assert.deepEqual(requested.result.body, { status: 'pending' });
  assert.equal(state.inserts, 1);

  state.status = 'approved';
  const approved = createResponse();
  await handler({ method: 'GET', headers: { cookie } }, approved);
  assert.equal(approved.result.statusCode, 200);
  assert.deepEqual(approved.result.body, { status: 'approved' });

  const repeatedRequest = createResponse();
  await handler({ method: 'POST', headers: { cookie } }, repeatedRequest);
  assert.deepEqual(repeatedRequest.result.body, { status: 'approved' });
  assert.equal(state.inserts, 1);
});

test('approval status requires an authenticated HttpOnly session cookie', async () => {
  const response = createResponse();
  await handler({ method: 'GET', headers: {} }, response);
  assert.equal(response.result.statusCode, 401);
  assert.deepEqual(response.result.body, { error: 'Unauthorized' });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import loginHandler from '../api/auth/login.js';
import logoutHandler from '../api/auth/logout.js';
import sessionHandler from '../api/auth/session.js';

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

function mockEnvironment(testContext, values) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, values);
  testContext.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function mockFetch(testContext, implementation) {
  const previous = globalThis.fetch;
  globalThis.fetch = implementation;
  testContext.after(() => {
    globalThis.fetch = previous;
  });
}

test('login stores provider tokens only in secure HttpOnly cookies', async (testContext) => {
  mockEnvironment(testContext, {
    SUPABASE_URL: 'https://unit-test.supabase.co',
    SUPABASE_ANON_KEY: 'test-publishable-key',
  });
  mockFetch(testContext, async (input, options) => {
    const url = new URL(input);
    assert.equal(url.pathname, '/auth/v1/token');
    assert.equal(url.searchParams.get('grant_type'), 'password');
    assert.equal(options.headers.apikey, 'test-publishable-key');
    assert.deepEqual(JSON.parse(options.body), {
      email: 'student@example.invalid',
      password: 'not-a-real-password',
    });
    return new Response(JSON.stringify({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  const response = createResponse();
  await loginHandler({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { email: 'student@example.invalid', password: 'not-a-real-password' },
  }, response);

  assert.equal(response.result.statusCode, 200);
  assert.deepEqual(response.result.body, { authenticated: true });
  const cookies = response.result.headers['set-cookie'];
  assert.equal(cookies.length, 2);
  assert.ok(cookies.every((cookie) => /HttpOnly; Secure; SameSite=Strict/u.test(cookie)));
  assert.ok(cookies[0].startsWith('__Host-aleph-access='));
  assert.ok(cookies[1].startsWith('__Host-aleph-refresh='));
  assert.equal(JSON.stringify(response.result.body).includes('test-access-token'), false);
});

test('invalid login is rejected without creating a session', async (testContext) => {
  mockEnvironment(testContext, {
    SUPABASE_URL: 'https://unit-test.supabase.co',
    SUPABASE_ANON_KEY: 'test-publishable-key',
  });
  mockFetch(testContext, async () => new Response('{}', { status: 400 }));

  const response = createResponse();
  await loginHandler({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { email: 'student@example.invalid', password: 'wrong-password' },
  }, response);

  assert.equal(response.result.statusCode, 401);
  assert.deepEqual(response.result.body, { error: 'Unauthorized' });
  assert.equal(response.result.headers['set-cookie'], undefined);
});

test('anonymous session check is rejected without contacting Supabase', async (testContext) => {
  mockFetch(testContext, async () => {
    assert.fail('an anonymous session check must not contact Supabase');
  });

  const response = createResponse();
  await sessionHandler({ method: 'GET', headers: {} }, response);

  assert.equal(response.result.statusCode, 401);
  assert.deepEqual(response.result.body, { error: 'Unauthorized' });
});

test('session check refreshes an expired cookie without returning tokens', async (testContext) => {
  mockEnvironment(testContext, {
    SUPABASE_URL: 'https://opgtqcxrirndpydbmwjv.supabase.co',
    SUPABASE_ANON_KEY: 'test-publishable-key',
    SUPABASE_SECRET_KEY: 'test-server-key',
  });
  mockFetch(testContext, async (input) => {
    const url = new URL(input);
    if (url.pathname === '/auth/v1/token') {
      return new Response(JSON.stringify({
        access_token: 'refreshed-access-token',
        refresh_token: 'rotated-refresh-token',
        expires_in: 3600,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/auth/v1/user') {
      return new Response(JSON.stringify({
        id: '00000000-0000-4000-8000-000000000001',
        aud: 'authenticated',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    assert.fail(`unexpected Supabase endpoint: ${url.pathname}`);
  });

  const response = createResponse();
  await sessionHandler({
    method: 'GET',
    headers: { cookie: '__Host-aleph-refresh=expired-refresh-cookie' },
  }, response);

  assert.equal(response.result.statusCode, 200);
  assert.deepEqual(response.result.body, { authenticated: true });
  assert.equal(JSON.stringify(response.result.body).includes('refreshed-access-token'), false);
  assert.ok(response.result.headers['set-cookie'][0].startsWith('__Host-aleph-access='));
  assert.ok(response.result.headers['set-cookie'][1].startsWith('__Host-aleph-refresh='));
});

test('logout clears both cookies when no session exists', async (testContext) => {
  mockFetch(testContext, async () => {
    assert.fail('logout without a session must not contact Supabase');
  });

  const response = createResponse();
  await logoutHandler({ method: 'POST', headers: {} }, response);

  assert.equal(response.result.statusCode, 200);
  assert.deepEqual(response.result.body, { authenticated: false });
  assert.equal(response.result.headers['set-cookie'].length, 2);
  assert.ok(response.result.headers['set-cookie'].every((cookie) => cookie.includes('Max-Age=0')));
});

test('logout refreshes an expired access token before revoking the session', async (testContext) => {
  mockEnvironment(testContext, {
    SUPABASE_URL: 'https://unit-test.supabase.co',
    SUPABASE_ANON_KEY: 'test-publishable-key',
  });
  let logoutCalls = 0;
  mockFetch(testContext, async (input, options) => {
    const url = new URL(input);
    if (url.pathname === '/auth/v1/logout') {
      logoutCalls += 1;
      if (logoutCalls === 1) return new Response('{}', { status: 401 });
      assert.equal(options.headers.authorization, 'Bearer fresh-access-token');
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/auth/v1/token') {
      assert.equal(JSON.parse(options.body).refresh_token, 'refresh-cookie');
      return new Response(JSON.stringify({
        access_token: 'fresh-access-token',
        refresh_token: 'rotated-refresh-token',
        expires_in: 3600,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    assert.fail(`unexpected Supabase endpoint: ${url.pathname}`);
  });

  const response = createResponse();
  await logoutHandler({
    method: 'POST',
    headers: {
      cookie: '__Host-aleph-access=expired-access-cookie; __Host-aleph-refresh=refresh-cookie',
    },
  }, response);

  assert.equal(response.result.statusCode, 200);
  assert.deepEqual(response.result.body, { authenticated: false });
  assert.equal(logoutCalls, 2);
  assert.ok(response.result.headers['set-cookie'].every((cookie) => cookie.includes('Max-Age=0')));
});

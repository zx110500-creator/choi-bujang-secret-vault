import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/notes.js';

test('unauthenticated GET returns a 401 JSON error without redirecting', async () => {
  const result = { statusCode: null, body: null };
  const response = {
    setHeader() {},
    status(statusCode) {
      result.statusCode = statusCode;
      return this;
    },
    json(body) {
      result.body = body;
    },
  };

  await handler({ method: 'GET', headers: {} }, response);

  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.body, { error: 'Unauthorized' });
});

test('authenticated list ignores client-supplied owners and filters by verified user ID', async (testContext) => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const previousEnvironment = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  };
  const previousFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://opgtqcxrirndpydbmwjv.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'x';
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname === '/auth/v1/user') {
      return new Response(JSON.stringify({ id: userId, aud: 'authenticated' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    assert.equal(url.pathname, '/rest/v1/notes');
    assert.equal(url.searchParams.get('owner_id'), `eq.${userId}`);
    return new Response(JSON.stringify([
      { id: 'note-1', title: 'Mine', body: 'Private' },
    ]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  testContext.after(() => {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const result = { statusCode: null, body: null };
  const response = {
    setHeader() {},
    status(statusCode) {
      result.statusCode = statusCode;
      return this;
    },
    json(body) {
      result.body = body;
    },
  };
  await handler({
    method: 'GET',
    url: '/api/notes?userId=other&owner_id=other',
    headers: {
      authorization: 'Bearer x',
      userId: 'other',
      owner_id: 'other',
    },
  }, response);

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, {
    notes: [{ id: 'note-1', title: 'Mine', body: 'Private' }],
  });
});

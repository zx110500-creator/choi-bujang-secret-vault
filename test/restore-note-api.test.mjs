import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import handler from '../api/admin/restore-note.js';

const ADMIN_ID = '00000000-0000-4000-8000-000000000003';
const OWNER_ID = '00000000-0000-4000-8000-000000000002';
const NOTE_ID = 'note-restore-b';
const BODY = '가상 계정 B의 복구 연습 메모입니다.';

function responseFor(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'content-range': '0-0/1', ...headers },
  });
}

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

function setEnvironment(testContext, overrides = {}) {
  const values = {
    SUPABASE_URL: 'https://opgtqcxrirndpydbmwjv.supabase.co',
    SUPABASE_SECRET_KEY: 'x',
    RESTORE_ADMIN_USER_ID: ADMIN_ID,
    RESTORE_NOTE_ID: NOTE_ID,
    RESTORE_NOTE_OWNER_ID: OWNER_ID,
    RESTORE_NOTE_BACKUP_JSON: JSON.stringify({
      id: NOTE_ID,
      owner_id: OWNER_ID,
      title: '복구 연습 메모',
      body: BODY,
      bodySha256: createHash('sha256').update(BODY, 'utf8').digest('hex'),
    }),
    ...overrides,
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  testContext.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function mockFetch(testContext, existingOwner = OWNER_ID) {
  const requests = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname === '/auth/v1/user') {
      return responseFor({ id: ADMIN_ID, aud: 'authenticated' });
    }
    assert.equal(url.pathname, '/rest/v1/notes');
    const method = options.method ?? 'GET';
    requests.push({ method, url, body: options.body });
    if (method === 'GET') {
      return existingOwner
        ? responseFor([{ id: NOTE_ID, owner_id: existingOwner }])
        : responseFor([]);
    }
    if (method === 'PATCH') return responseFor({ id: NOTE_ID }, 200);
    if (method === 'POST') return responseFor([{ id: NOTE_ID }], 201);
    assert.fail(`unexpected database method: ${method}`);
  };
  testContext.after(() => {
    globalThis.fetch = previous;
  });
  return requests;
}

async function invoke({ method = 'POST', headers = { authorization: 'Bearer test-token' },
  url = '/api/admin/restore-note', body } = {}) {
  const response = createResponse();
  await handler({ method, headers, url, body }, response);
  return response.result;
}

test('only the verified configured admin can restore the single matching note', async (t) => {
  setEnvironment(t);
  const requests = mockFetch(t);
  const result = await invoke();

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { restored: true });
  assert.deepEqual(requests.map(request => request.method), ['GET', 'PATCH']);
  const update = requests[1];
  assert.equal(update.url.searchParams.get('id'), `eq.${NOTE_ID}`);
  assert.equal(update.url.searchParams.get('owner_id'), `eq.${OWNER_ID}`);
  assert.deepEqual(JSON.parse(update.body), {
    title: '복구 연습 메모',
    body: BODY,
  });
});

test('a deleted target is inserted without upserting over another owner', async (t) => {
  setEnvironment(t);
  const requests = mockFetch(t, null);
  const result = await invoke();

  assert.equal(result.statusCode, 200);
  assert.deepEqual(requests.map(request => request.method), ['GET', 'POST']);
  assert.deepEqual(JSON.parse(requests[1].body), {
    id: NOTE_ID,
    owner_id: OWNER_ID,
    title: '복구 연습 메모',
    body: BODY,
  });
});

test('a target owned by someone else is never overwritten', async (t) => {
  setEnvironment(t);
  const requests = mockFetch(t, '00000000-0000-4000-8000-000000000004');
  const result = await invoke();

  assert.equal(result.statusCode, 409);
  assert.deepEqual(result.body, { error: 'RESTORE_TARGET_OWNER_MISMATCH' });
  assert.deepEqual(requests.map(request => request.method), ['GET']);
});

test('anonymous restore returns 401 before checking backup configuration', async (t) => {
  setEnvironment(t, { RESTORE_NOTE_BACKUP_JSON: '' });
  const previous = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('anonymous restore must not contact Supabase');
  t.after(() => {
    globalThis.fetch = previous;
  });
  const result = await invoke({ headers: {} });

  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.body, { error: 'Unauthorized' });
});

test('non-admin and body-hash mismatch are rejected before writes', async (t) => {
  setEnvironment(t);
  const requests = mockFetch(t);
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname === '/auth/v1/user') {
      return responseFor({ id: OWNER_ID, aud: 'authenticated' });
    }
    assert.fail('a non-admin must not access the notes table');
  };
  t.after(() => {
    globalThis.fetch = previous;
  });
  const nonAdmin = await invoke();
  assert.equal(nonAdmin.statusCode, 403);
  assert.deepEqual(nonAdmin.body, { error: 'RESTORE_ADMIN_REQUIRED' });
  assert.equal(requests.length, 0);

  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname === '/auth/v1/user') {
      return responseFor({ id: ADMIN_ID, aud: 'authenticated' });
    }
    assert.fail('invalid backup must not access the notes table');
  };
  const badHash = JSON.parse(process.env.RESTORE_NOTE_BACKUP_JSON);
  badHash.bodySha256 = '0'.repeat(64);
  process.env.RESTORE_NOTE_BACKUP_JSON = JSON.stringify(badHash);
  const invalidBackup = await invoke();
  assert.equal(invalidBackup.statusCode, 503);
  assert.deepEqual(invalidBackup.body, { error: 'RESTORE_NOT_CONFIGURED' });
  assert.equal(requests.length, 0);
});

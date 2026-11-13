import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/notes/[id].js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const state = {
  ownerId: USER_ID,
  databaseRequests: [],
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'content-range': '0-0/1' },
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

const previousFetch = globalThis.fetch;
const previousEnvironment = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
};
process.env.SUPABASE_URL = 'https://opgtqcxrirndpydbmwjv.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'x';
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.pathname === '/auth/v1/user') {
    return jsonResponse({ id: USER_ID, aud: 'authenticated' });
  }
  if (url.pathname !== '/rest/v1/notes') {
    assert.fail(`unexpected Supabase endpoint: ${url.pathname}`);
  }

  const method = options.method ?? 'GET';
  state.databaseRequests.push({ method, url, body: options.body });
  if (method === 'GET') {
    return state.ownerId
      ? jsonResponse({
        id: 'note-1', owner_id: state.ownerId, title: 'Title', body: '',
      })
      : jsonResponse(null, 406);
  }
  if (method === 'PATCH') {
    return jsonResponse({ id: 'note-1', ...JSON.parse(options.body) });
  }
  if (method === 'DELETE') {
    return jsonResponse({ id: 'note-1' });
  }
  assert.fail(`unexpected database method: ${method}`);
};

test('per-note API verifies the owner for reads, updates, and deletes', async (testContext) => {
  testContext.after(() => {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const invoke = async (method, { ownerId = USER_ID, body } = {}) => {
    state.ownerId = ownerId;
    state.databaseRequests = [];
    const response = createResponse();
    await handler({
      method,
      url: '/api/notes/note-1',
      query: { id: 'note-1' },
      headers: { authorization: 'Bearer x' },
      body,
    }, response);
    return { response: response.result, requests: state.databaseRequests };
  };

  const ownRead = await invoke('GET');
  assert.equal(ownRead.response.statusCode, 200);
  assert.deepEqual(ownRead.response.body, {
    note: { id: 'note-1', title: 'Title', body: '' },
  });

  for (const method of ['GET', 'PATCH', 'DELETE']) {
    const foreign = await invoke(method, {
      ownerId: '00000000-0000-4000-8000-000000000002',
      body: { title: 'Not mine' },
    });
    assert.equal(foreign.response.statusCode, 403);
    assert.deepEqual(foreign.response.body, {
      error: 'Forbidden', reason: 'note_not_owned',
    });
    assert.equal(foreign.requests.some(item => item.method === 'PATCH'
      || item.method === 'DELETE'), false);
  }

  const updated = await invoke('PATCH', { body: { title: 'Changed' } });
  assert.equal(updated.response.statusCode, 200);
  assert.deepEqual(updated.response.body, {
    note: { id: 'note-1', title: 'Changed' },
  });
  const updateRequest = updated.requests.find(item => item.method === 'PATCH');
  assert.equal(updateRequest.url.searchParams.get('owner_id'), `eq.${USER_ID}`);

  const deleted = await invoke('DELETE');
  assert.equal(deleted.response.statusCode, 200);
  const deleteRequest = deleted.requests.find(item => item.method === 'DELETE');
  assert.equal(deleteRequest.url.searchParams.get('owner_id'), `eq.${USER_ID}`);

  const forgedRole = await invoke('PATCH', {
    body: { title: 'Changed', role: 'teacher' },
  });
  assert.equal(forgedRole.response.statusCode, 400);
  assert.equal(forgedRole.requests.some(item => item.method === 'PATCH'), false);
});

test('per-note API accepts non-UUID IDs but rejects feature/query paths', async () => {
  const response = createResponse();
  await handler({
    method: 'GET',
    url: '/api/notes/export',
    query: { id: 'export' },
    headers: {},
  }, response);
  assert.equal(response.result.statusCode, 400);

  const queryResponse = createResponse();
  await handler({
    method: 'GET',
    url: '/api/notes/note-1?export=1',
    query: { id: 'note-1', export: '1' },
    headers: {},
  }, queryResponse);
  assert.equal(queryResponse.result.statusCode, 400);
});

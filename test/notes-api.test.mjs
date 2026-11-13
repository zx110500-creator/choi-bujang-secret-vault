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

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAttackChecks } from '../src/attack-check.mjs';

test('step-12 bundle checks use only fixed unauthenticated requests and actual statuses',
  async (testContext) => {
    const previousFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(input);
      requests.push({ url, options });
      return new Response(null, { status: 401 });
    };
    testContext.after(() => {
      globalThis.fetch = previousFetch;
    });

    const attempts = await runAttackChecks({
      step: 12,
      publicAppUrl: 'https://byte-back-test.invalid',
    });

    assert.equal(requests.length, 7);
    assert.ok(requests.every(({ url }) => url.origin === 'https://byte-back-test.invalid'));
    assert.deepEqual(requests.map(({ options }) => options.method ?? 'GET'), [
      'GET', 'GET', 'GET', 'GET', 'GET', 'GET', 'POST',
    ]);
    assert.ok(requests.every(({ options }) => !options.headers));
    assert.ok(attempts.every(item => item.observed === 'HTTP 401'));
    assert.equal(attempts.length, 7);
  });

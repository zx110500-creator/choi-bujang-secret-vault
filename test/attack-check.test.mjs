import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UNEXECUTED_CHECKS, VERIFICATION_PROBES } from '../public/verification-probes.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';

test('step-12 bundle checks use only fixed unauthenticated requests and actual statuses',
  async (testContext) => {
    const previousFetch = globalThis.fetch;
    const requests = [];
    const statuses = [401, 401, 403, 403, 401, 401, 401];
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(input);
      requests.push({ url, options });
      return new Response(null, { status: statuses[requests.length - 1] });
    };
    testContext.after(() => {
      globalThis.fetch = previousFetch;
    });

    const attempts = await runAttackChecks({
      step: 12,
      publicAppUrl: 'https://byte-back-test.invalid',
    });

    assert.equal(requests.length, VERIFICATION_PROBES.length);
    assert.ok(requests.every(({ url }) => url.origin === 'https://byte-back-test.invalid'));
    assert.deepEqual(requests.map(({ url }) => `${url.pathname}${url.search}`),
      VERIFICATION_PROBES.map(probe => probe.path));
    assert.deepEqual(requests.map(({ options }) => options.method),
      VERIFICATION_PROBES.map(probe => probe.method));
    assert.ok(requests.every(({ options }) => !options.headers
      && options.credentials === 'omit'));
    assert.deepEqual(attempts.map(item => item.observed),
      statuses.map(status => `HTTP ${status}`));
    assert.equal(attempts.length, VERIFICATION_PROBES.length);
    assert.ok(UNEXECUTED_CHECKS.find(item => item.id === 'foreign-note-owner')
      .initial.startsWith('미실행'));
  });

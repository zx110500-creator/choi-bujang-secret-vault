const ACCESS_TOKEN_ENV = 'ALEPH_TEST_ACCESS_TOKEN';
const FOREIGN_NOTE_ID_ENV = 'ALEPH_TEST_FOREIGN_NOTE_ID';
const ALLOW_MUTATIONS_ENV = 'ALEPH_TEST_ALLOW_MUTATION';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function getAppUrl(config) {
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  return app;
}

function observedStatus(response) {
  return `HTTP ${response.status}`;
}

async function getJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function checkStageOne(config, app) {
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) {
    throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  }
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    const data = await getJson(response);
    visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
      && data.notes.length > 0;
  }
  return [{
    attackId: 'anonymous_note_read',
    expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible
      ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임'
      : `비로그인 요청에서 확인 표시가 보이지 않음 (${observedStatus(response)})`,
  }];
}

async function sendNotesRequest(url, options = {}) {
  return fetch(url, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
}

function result(attackId, expected, observed) {
  return { attackId, expected, observed };
}

async function checkStageFour(app) {
  const attempts = [];
  const baseUrl = new URL('/api/notes', app);
  const anonymous = await sendNotesRequest(baseUrl);
  attempts.push(result(
    'anonymous_note_list',
    '로그인 없는 목록 조회는 HTTP 401 또는 403',
    observedStatus(anonymous),
  ));

  const accessToken = process.env[ACCESS_TOKEN_ENV];
  const foreignNoteId = process.env[FOREIGN_NOTE_ID_ENV];
  const allowMutations = process.env[ALLOW_MUTATIONS_ENV] === '1';

  if (allowMutations && (!accessToken || !foreignNoteId)) {
    throw new Error(`${ALLOW_MUTATIONS_ENV}=1일 때 ${ACCESS_TOKEN_ENV}와 ${FOREIGN_NOTE_ID_ENV}가 필요합니다.`);
  }
  if (foreignNoteId && !UUID.test(foreignNoteId)) {
    throw new Error(`${FOREIGN_NOTE_ID_ENV}에는 테스트 메모의 UUID가 필요합니다.`);
  }

  if (accessToken) {
    if (accessToken.length > 8192 || /\s/u.test(accessToken)) {
      throw new Error(`${ACCESS_TOKEN_ENV} 형식이 올바르지 않습니다.`);
    }

    const authorization = `Bearer ${accessToken}`;
    const baselineResponse = await sendNotesRequest(baseUrl, {
      headers: { authorization },
    });
    const baseline = await getJson(baselineResponse);
    const baselineValid = baselineResponse.ok && Array.isArray(baseline?.notes);
    attempts.push(result(
      'authenticated_note_list_baseline',
      '인증된 사용자 본인의 메모 목록이 반환됨',
      `${observedStatus(baselineResponse)}${baselineValid ? ', notes 배열 확인' : ', notes 배열 확인 실패'}`,
    ));

    for (const [attackId, url, headers] of [
      [
        'ignore_identity_query',
        new URL('/api/notes?userId=spoof-user&owner_id=spoof-owner', app),
        { authorization },
      ],
      [
        'ignore_identity_headers',
        baseUrl,
        { authorization, userId: 'spoof-user', owner_id: 'spoof-owner' },
      ],
    ]) {
      const response = await sendNotesRequest(url, { headers });
      const payload = await getJson(response);
      const sameNotes = baselineValid && response.ok && Array.isArray(payload?.notes)
        && JSON.stringify(payload.notes) === JSON.stringify(baseline.notes);
      attempts.push(result(
        attackId,
        'userId·owner_id 위조로 목록 소유자가 바뀌지 않고 본인 목록만 반환됨',
        `${observedStatus(response)}, 기준 목록과 ${sameNotes ? '동일' : '다름 또는 비교 불가'}`,
      ));
    }

    if (allowMutations) {
      const noteUrl = new URL(`/api/notes/${encodeURIComponent(foreignNoteId)}`, app);
      const update = await sendNotesRequest(noteUrl, {
        method: 'PUT',
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Access-control test', body: 'Access-control test' }),
      });
      attempts.push(result(
        'deny_foreign_note_update',
        '타인 메모 수정은 HTTP 401 또는 403으로 거부됨',
        observedStatus(update),
      ));

      const deletion = await sendNotesRequest(noteUrl, {
        method: 'DELETE',
        headers: { authorization },
      });
      attempts.push(result(
        'deny_foreign_note_delete',
        '타인 메모 삭제는 HTTP 401 또는 403으로 거부됨',
        observedStatus(deletion),
      ));
    }
  }

  return attempts;
}

async function checkAnonymousApi(app) {
  const sessionUrl = new URL('/api/auth/session', app);
  const notesUrl = new URL('/api/notes', app);
  const [session, notes] = await Promise.all([
    sendNotesRequest(sessionUrl),
    sendNotesRequest(notesUrl),
  ]);
  return [
    result(
      'anonymous_session_check',
      '로그인 없는 세션 확인은 HTTP 401 또는 403',
      observedStatus(session),
    ),
    result(
      'anonymous_note_list',
      '로그인 없는 메모 조회는 HTTP 401 또는 403',
      observedStatus(notes),
    ),
  ];
}

export async function runAttackChecks(config) {
  const app = getAppUrl(config);
  if (config.step === 1) return checkStageOne(config, app);
  if (config.step === 4) return checkStageFour(app);
  if (config.step === 5 || config.step === 6) return checkAnonymousApi(app);
  throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
}

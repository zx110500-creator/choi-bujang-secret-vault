const deniedStatuses = Object.freeze([401, 403]);

function deniedProbe(id, category, request, path, method = 'GET') {
  return Object.freeze({
    id,
    category,
    request,
    path,
    method,
    expected: 'HTTP 401 또는 403',
    expectedStatuses: deniedStatuses,
    initial: '미실행',
  });
}

export const VERIFICATION_PROBES = Object.freeze([
  deniedProbe(
    'anonymous_session_check',
    '12 / 비인증',
    '쿠키 없이 GET /api/auth/session',
    '/api/auth/session',
  ),
  deniedProbe(
    'anonymous_note_list',
    '1첩반상 · 요청 1/2',
    '쿠키 없이 GET /api/notes',
    '/api/notes',
  ),
  deniedProbe(
    'anonymous_note_item',
    '1첩반상 · 요청 2/2',
    '쿠키 없이 GET /api/notes/ops-probe (소유자 미확인 테스트 ID)',
    '/api/notes/ops-probe',
  ),
  deniedProbe(
    'out_of_zone_query',
    '8 / 구역 밖',
    '쿠키 없이 GET /api/notes/ops-probe?scope=outside',
    '/api/notes/ops-probe?scope=outside',
  ),
  deniedProbe(
    'anonymous_device_status',
    '11 / 비인증',
    '쿠키 없이 GET /api/device-approval',
    '/api/device-approval',
  ),
  deniedProbe(
    'anonymous_ops_overview',
    '12 / 비인증',
    '쿠키 없이 GET /api/ops/overview',
    '/api/ops/overview',
  ),
  deniedProbe(
    'anonymous_restore_note',
    '10 / 비인증',
    '쿠키 없이 POST /api/admin/restore-note',
    '/api/admin/restore-note',
    'POST',
  ),
]);

export const UNEXECUTED_CHECKS = Object.freeze([
  {
    id: 'foreign-note-owner',
    category: '1첩반상 / 실제 소유권',
    request: '검증된 타인 메모 UUID로 GET /api/notes/:id',
    expected: 'HTTP 403',
    initial: '미실행(안전한 타인 메모 UUID 없음)',
  },
  {
    id: 'approved-list',
    category: '8·11 / 정상',
    request: '승인된 로그인 기기로 GET /api/notes',
    expected: 'HTTP 200',
    initial: '미실행(승인된 사용자 세션 필요)',
  },
  {
    id: 'revoked-device',
    category: '11 / 회수',
    request: '회수된 기기로 GET /api/notes',
    expected: 'HTTP 403',
    initial: '미실행(실제 회수 기기 없음)',
  },
  {
    id: 'revoked-identity',
    category: '11 / 회수 신원',
    request: '회수된 신원 세션 재사용',
    expected: 'HTTP 401',
    initial: '미실행(신원 회수 API 미연결)',
  },
  {
    id: 'unregistered-device',
    category: '6·11 / 미등록 기기',
    request: '별도 미등록 기기로 GET /api/notes',
    expected: 'HTTP 403',
    initial: '미실행(격리 브라우저 필요)',
  },
  {
    id: 'unsigned-update',
    category: '8·10 / 서명 없는 수정',
    request: 'PATCH 서명 검증',
    expected: '서명 규약 미정',
    initial: '미실행(기존 수정 기능 보존)',
  },
  {
    id: 'detection-events',
    category: '9 / 탐지',
    request: '운영 탐지 사건 API 조회',
    expected: '실제 사건 요약',
    initial: '미실행(운영 사건 API 미연결)',
  },
  {
    id: 'restore-version',
    category: '10 / 복구',
    request: '복구 이력/버전 API 조회',
    expected: '실제 복구 버전',
    initial: '미실행(복구 이력 API 없음)',
  },
]);

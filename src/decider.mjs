// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze([
  'device_registered',
  'step_up_required',
  'auth_route',
  'memo_item_route',
  'memo_list_denied',
  'unrecognized_route_denied',
]);

const AUTH_ROUTES = Object.freeze([
  { method: 'POST', paths: ['/api/auth/login', '/auth/login'] },
  { method: 'GET', paths: ['/api/auth/session', '/auth/session'] },
  { method: 'POST', paths: ['/api/auth/logout', '/auth/logout'] },
]);

function response(request, decision, reasonCode, ruleIds) {
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision,
    reasonCode,
    ruleIds,
  };
}

function isAuthRoute(request) {
  if (request.queryLength !== 0) return false;
  return AUTH_ROUTES.some(({ method, paths }) => request.method === method
    && paths.includes(request.path)
    && paths.some(path => request.route === `${method} ${path}`));
}

function memoRouteDecision(request) {
  if (request.service !== 'notes') return null;
  if (request.path === '/notes' || request.path === '/api/notes') {
    return {
      decision: 'deny',
      reasonCode: 'route_not_allowed',
      ruleIds: ['device_registered', 'memo_list_denied'],
    };
  }
  if (!['GET', 'PATCH', 'DELETE'].includes(request.method) || request.queryLength !== 0) {
    return null;
  }

  const match = /^\/(?:api\/)?notes\/([A-Za-z0-9][A-Za-z0-9._~-]{0,127})$/u
    .exec(request.path);
  if (!match || match[1].toLowerCase() === 'export') return null;
  const routeIsValid = [
    `${request.method} /notes/:id`,
    `${request.method} /api/notes/:id`,
  ].includes(request.route);
  if (!routeIsValid) return null;
  return {
    decision: 'allow',
    reasonCode: 'approved',
    ruleIds: ['device_registered', 'memo_item_route'],
  };
}

// Only fixture signals have a known baseline; live or missing telemetry requires step-up.
function hasKnownRiskContext(request) {
  const { signals, recentEvents, stepUp } = request;
  const validSignals = signals && signals.source === 'judge_fixture'
    && typeof signals.region === 'string' && signals.region.length > 0
    && typeof signals.network === 'string' && signals.network.length > 0
    && Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour <= 23;
  const validEvents = Array.isArray(recentEvents) && recentEvents.length <= 12
    && recentEvents.every(event => event && typeof event.kind === 'string'
      && Number.isFinite(event.ageSeconds) && event.ageSeconds >= 0
      && Number.isInteger(event.count) && event.count >= 0);
  const validStepUp = stepUp && typeof stepUp.verified === 'boolean'
    && (stepUp.verified
      ? Number.isInteger(stepUp.authAgeSeconds)
        && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= 900
      : stepUp.authAgeSeconds === null);
  return Boolean(validSignals && validEvents && validStepUp);
}

function needsStepUp(request) {
  if (!hasKnownRiskContext(request)) return true;
  const { signals, recentEvents } = request;
  return signals.region !== 'local'
    || signals.network !== 'usual'
    || signals.hour < 6
    || signals.hour >= 22
    || recentEvents.some(event => event.count >= 20);
}

export async function decide(request) {
  if (isAuthRoute(request)) {
    return response(request, 'allow', 'approved', ['auth_route']);
  }

  const registered = request.deviceRegistered === true;
  if (!registered) {
    return response(request, 'deny', 'device_not_registered', ['device_registered']);
  }

  const routeDecision = memoRouteDecision(request);
  if (!routeDecision) {
    return response(request, 'deny', 'route_not_allowed',
      ['device_registered', 'unrecognized_route_denied']);
  }
  if (routeDecision.decision === 'deny') {
    return response(request, routeDecision.decision, routeDecision.reasonCode, routeDecision.ruleIds);
  }

  const stepUpRequired = needsStepUp(request);
  const stepUpVerified = request.stepUp?.verified === true
    && Number.isInteger(request.stepUp.authAgeSeconds)
    && request.stepUp.authAgeSeconds >= 0
    && request.stepUp.authAgeSeconds <= 900;
  const ruleIds = ['device_registered', 'memo_item_route'];
  if (stepUpRequired) ruleIds.push('step_up_required');
  return response(
    request,
    stepUpRequired && !stepUpVerified ? 'step_up' : 'allow',
    stepUpRequired && !stepUpVerified ? 'step_up_required' : 'approved',
    ruleIds,
  );
}

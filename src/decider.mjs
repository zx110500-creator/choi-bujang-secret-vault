// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required']);

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
  const registered = request.deviceRegistered === true;
  if (!registered) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'device_not_registered',
      ruleIds: ['device_registered'],
    };
  }

  const stepUpRequired = needsStepUp(request);
  const stepUpVerified = request.stepUp?.verified === true
    && Number.isInteger(request.stepUp.authAgeSeconds)
    && request.stepUp.authAgeSeconds >= 0
    && request.stepUp.authAgeSeconds <= 900;
  const ruleIds = stepUpRequired
    ? ['device_registered', 'step_up_required']
    : ['device_registered'];
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: stepUpRequired && !stepUpVerified ? 'step_up' : 'allow',
    reasonCode: stepUpRequired && !stepUpVerified ? 'step_up_required' : 'approved',
    ruleIds,
  };
}

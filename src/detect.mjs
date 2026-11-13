// 9단계에서 학생이 채우는 탐지 함수입니다. 이 기본값은 어떤 접속도 회수하지 않습니다.
// 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.
const WINDOW_MS = 10 * 60 * 1000;
const READ_LIMIT = 120;

export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const readsBySubject = new Map();

  for (const event of events) {
    const at = typeof event?.at === 'string' ? Date.parse(event.at) : NaN;
    const method = event?.method;
    const subject = event?.identity?.sub;
    if (!Number.isFinite(at) || typeof method !== 'string'
        || typeof subject !== 'string' || !subject) {
      throw new TypeError('invalid_detection_event');
    }
    if (method !== 'GET') continue;

    const reads = readsBySubject.get(subject) ?? [];
    reads.push(at);
    readsBySubject.set(subject, reads);
  }

  for (const [subject, timestamps] of readsBySubject) {
    timestamps.sort((left, right) => left - right);
    let start = 0;
    for (let end = 0; end < timestamps.length; end += 1) {
      while (timestamps[end] - timestamps[start] > WINDOW_MS) start += 1;
      if (end - start + 1 > READ_LIMIT) {
        return { action: 'propose_revocation', reasonCode: 'burst_read', subject };
      }
    }
  }

  return { action: 'observe' };
}

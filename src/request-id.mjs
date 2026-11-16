import { randomUUID } from 'node:crypto';

export function setRequestId(response) {
  const requestId = randomUUID();
  response.setHeader('X-Request-Id', requestId);
  return requestId;
}

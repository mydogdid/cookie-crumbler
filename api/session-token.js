import crypto from 'node:crypto';

const TOKEN_TTL_MS = 15 * 60 * 1000;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function unbase64url(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getSecret() {
  const secret = process.env.GAME_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('Missing game session secret');
  }
  return secret;
}

function sign(data) {
  return crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createGameSession(now = Date.now()) {
  const session = {
    iat: now,
    sid: crypto.randomBytes(16).toString('base64url')
  };
  const encodedPayload = base64url(JSON.stringify(session));
  return { session, token: `${encodedPayload}.${sign(encodedPayload)}` };
}

export function createGameToken(now = Date.now()) {
  return createGameSession(now).token;
}

export function verifyGameToken(token, now = Date.now()) {
  if (typeof token !== 'string') return null;

  const [encodedPayload, signature, extra] = token.split('.');
  if (!encodedPayload || !signature || extra !== undefined) return null;
  if (!safeEqual(sign(encodedPayload), signature)) return null;

  try {
    const payload = JSON.parse(unbase64url(encodedPayload));
    if (!Number.isInteger(payload.iat) || typeof payload.sid !== 'string') return null;
    if (payload.iat > now + 5000) return null;
    if (now - payload.iat > TOKEN_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

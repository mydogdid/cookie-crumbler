import postgres from 'postgres';
import { verifyGameToken } from './session-token.js';

const MAX_SCORES = 1500;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 5;
const SCORE_SUBMIT_GRACE_MS = 5000;
const MAX_FINISHED_WAIT_MS = 2 * 60 * 1000;
const recentSubmissions = new Map();
const NAME_RE = /^[A-Z0-9 _.-]{1,8}$/;
const BANNED = [
  'nigger','nigga','nigg','niger','niga','chink','gookk','gook','spic','spick','spik',
  'wetback','beaner','kike','hymie','coon','jigaboo','jigabo','redskin','redski',
  'towelhead','raghead','sandnig','zipperhead','paki','wog','greaseball','dago',
  'guinea','guine','polack','polak','cracker','honkey','honky','cholo','faggot',
  'fagget','faget','dyke','dike','tranny','tranni','retard','hitler','heil','nazi',
  'naazi','kkk','kkklux'
].map(normalizeStr);

const sql = process.env.SUPABASE_DB_URL
  ? postgres(process.env.SUPABASE_DB_URL, { max: 1, ssl: 'require' })
  : null;

function normalizeStr(value) {
  return String(value).toLowerCase()
    .replace(/1/g, 'i').replace(/0/g, 'o').replace(/3/g, 'e')
    .replace(/@/g, 'a').replace(/\$/g, 's').replace(/5/g, 's')
    .replace(/4/g, 'a').replace(/7/g, 't').replace(/\+/g, 't')
    .replace(/[^a-z]/g, '');
}

function isClean(name) {
  const norm = normalizeStr(name);
  return !BANNED.some((word) => norm.includes(word));
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(req) {
  const now = Date.now();
  const key = clientIp(req);
  const previous = recentSubmissions.get(key) || [];
  const current = previous.filter((time) => now - time < RATE_LIMIT_WINDOW_MS);

  if (current.length >= RATE_LIMIT_MAX) {
    recentSubmissions.set(key, current);
    return true;
  }

  current.push(now);
  recentSubmissions.set(key, current);
  return false;
}

function validateScore(body) {
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return { error: 'Invalid JSON' };
    }
  }

  const name = String(body?.name || 'ANON').trim().toUpperCase();
  const clicks = Number(body?.clicks);
  const timeMs = Number(body?.time_ms);
  const gameToken = body?.game_token;

  if (!NAME_RE.test(name) || !isClean(name)) {
    return { error: 'Invalid name' };
  }

  if (!Number.isInteger(clicks) || clicks < 1 || clicks > 5000) {
    return { error: 'Invalid clicks' };
  }

  if (!Number.isInteger(timeMs) || timeMs < 1000 || timeMs > 10 * 60 * 1000) {
    return { error: 'Invalid time' };
  }

  if (clicks / (timeMs / 1000) > 30) {
    return { error: 'Score is not realistic' };
  }

  const session = verifyGameToken(gameToken);
  if (!session) {
    return { error: 'Invalid game session' };
  }

  const sessionAge = Date.now() - session.iat;
  if (sessionAge + SCORE_SUBMIT_GRACE_MS < timeMs) {
    return { error: 'Score does not match game session' };
  }

  if (sessionAge - timeMs > MAX_FINISHED_WAIT_MS) {
    return { error: 'Game session expired' };
  }

  return { score: { name, clicks, timeMs } };
}

async function getScores(req, res) {
  const rows = await sql`
    select name, clicks, time_ms
    from public.scores
    order by clicks asc, time_ms asc
    limit ${MAX_SCORES}
  `;
  send(res, 200, { scores: rows });
}

async function addScore(req, res) {
  if (isRateLimited(req)) {
    send(res, 429, { error: 'Too many submissions' });
    return;
  }

  const validation = validateScore(req.body);
  if (validation.error) {
    send(res, 400, { error: validation.error });
    return;
  }

  await sql`
    insert into public.scores (name, clicks, time_ms)
    values (${validation.score.name}, ${validation.score.clicks}, ${validation.score.timeMs})
  `;
  send(res, 201, { ok: true });
}

export default async function handler(req, res) {
  try {
    if (!sql) {
      send(res, 500, { error: 'Missing database configuration' });
      return;
    }

    if (req.method === 'GET') {
      await getScores(req, res);
      return;
    }

    if (req.method === 'POST') {
      await addScore(req, res);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    send(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    send(res, 500, { error: 'Server error' });
  }
}

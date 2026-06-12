import { ensureSecurityTables, sql } from './db.js';
import { verifyGameToken } from './session-token.js';

const MAX_SCORES = 1500;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 5;
const DB_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DB_RATE_LIMIT_MAX = 8;
const NAME_COOLDOWN_MS = 10 * 1000;
const MIN_REALISTIC_TIME_MS = 700;
const SCORE_SUBMIT_GRACE_MS = 2500;
const MAX_FINISHED_WAIT_MS = 30 * 1000;
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

function isScoreRealismConstraintError(error) {
  return error?.constraint_name === 'scores_realistic_rate_check'
    || error?.constraint === 'scores_realistic_rate_check'
    || error?.constraint_name === 'scores_time_ms_range_check'
    || error?.constraint === 'scores_time_ms_range_check';
}

function normalizeStr(value) {
  return String(value).toLowerCase()
    .replace(/1/g, 'i').replace(/0/g, 'o').replace(/3/g, 'e')
    .replace(/@/g, 'a').replace(/\$/g, 's').replace(/5/g, 's')
    .replace(/4/g, 'a').replace(/7/g, 't').replace(/\+/g, 't')
    .replace(/[^a-z]/g, '');
}

function isClean(name) {
  const norm = normalizeStr(name);
  return !norm.startsWith('davide') && !BANNED.some((word) => norm.includes(word));
}

function isVisibleScoreName(name) {
  return !normalizeStr(name).startsWith('davide');
}

function isBetterScore(score, current) {
  if (!current) return true;
  if (score.timeMs !== current.time_ms) return score.timeMs < current.time_ms;
  return score.clicks < current.clicks;
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

async function isDatabaseRateLimited(req, name) {
  await ensureSecurityTables();
  const ip = clientIp(req);
  const normalizedName = normalizeStr(name) || 'anon';
  const ipCutoff = new Date(Date.now() - DB_RATE_LIMIT_WINDOW_MS);
  const nameCutoff = new Date(Date.now() - NAME_COOLDOWN_MS);

  await sql`
    delete from public.score_attempts
    where created_at < now() - interval '1 day'
  `;

  const [ipWindow] = await sql`
    select count(*)::int as count
    from public.score_attempts
    where ip = ${ip}
      and created_at > ${ipCutoff}
  `;
  if ((ipWindow?.count || 0) >= DB_RATE_LIMIT_MAX) return true;

  const [recentName] = await sql`
    select 1
    from public.score_attempts
    where normalized_name = ${normalizedName}
      and created_at > ${nameCutoff}
    limit 1
  `;
  if (recentName) return true;

  await sql`
    insert into public.score_attempts (ip, name, normalized_name)
    values (${ip}, ${name}, ${normalizedName})
  `;
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

  if (!Number.isInteger(timeMs) || timeMs > 10 * 60 * 1000) {
    return { error: 'Invalid time' };
  }

  if (timeMs < MIN_REALISTIC_TIME_MS) {
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

  return { score: { name, clicks, timeMs }, session };
}

async function consumeGameSession(tx, session, req) {
  const rows = await tx`
    update public.game_sessions
    set used_at = now(),
        used_ip = ${clientIp(req)}
    where sid = ${session.sid}
      and used_at is null
      and issued_at > now() - interval '15 minutes'
    returning sid
  `;
  return rows.length > 0;
}

async function getScores(req, res) {
  const rows = await sql`
    select name, clicks, time_ms
    from (
      select distinct on (name) name, clicks, time_ms
      from public.scores
      where regexp_replace(
        translate(lower(name), '103@$547+', 'ioeassatt'),
        '[^a-z]',
        '',
        'g'
      ) not like 'davide%'
      order by name, time_ms asc, clicks asc
    ) best_by_name
    order by time_ms asc, clicks asc
    limit ${MAX_SCORES}
  `;
  send(res, 200, { scores: rows.filter((score) => isVisibleScoreName(score.name)) });
}

async function addScore(req, res) {
  if (isRateLimited(req)) {
    send(res, 429, { error: 'Too many submissions' });
    return;
  }

  const validation = validateScore(req.body);
  if (validation.error) {
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    console.warn('Rejected score submission', {
      error: validation.error,
      name: body.name,
      clicks: body.clicks,
      time_ms: body.time_ms
    });
    send(res, 400, { error: validation.error });
    return;
  }

  if (await isDatabaseRateLimited(req, validation.score.name)) {
    send(res, 429, { error: 'Too many submissions' });
    return;
  }

  try {
    const saved = await sql.begin(async (tx) => {
      const sessionConsumed = await consumeGameSession(tx, validation.session, req);
      if (!sessionConsumed) {
        return 'invalid-session';
      }

      const existingRows = await tx`
        select clicks, time_ms
        from public.scores
        where name = ${validation.score.name}
        order by time_ms asc, clicks asc
        for update
      `;
      const currentBest = existingRows[0];

      if (!isBetterScore(validation.score, currentBest)) {
        return 'kept';
      }

      await tx`
        delete from public.scores
        where name = ${validation.score.name}
      `;
      await tx`
        insert into public.scores (name, clicks, time_ms)
        values (${validation.score.name}, ${validation.score.clicks}, ${validation.score.timeMs})
      `;
      return 'saved';
    });

    if (saved === 'invalid-session') {
      send(res, 400, { error: 'Invalid game session' });
      return;
    }

    if (saved === 'kept') {
      send(res, 200, { ok: true, kept: true });
      return;
    }
  } catch (error) {
    if (isScoreRealismConstraintError(error)) {
      console.warn('Database rejected score realism', {
        clicks: validation.score.clicks,
        time_ms: validation.score.timeMs
      });
      send(res, 400, { error: 'Score is not realistic' });
      return;
    }
    throw error;
  }
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
    console.error('Scores API failed', {
      message: error?.message,
      code: error?.code,
      constraint: error?.constraint,
      constraint_name: error?.constraint_name
    });
    send(res, 500, { error: 'Server error' });
  }
}

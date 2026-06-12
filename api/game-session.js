import { ensureSecurityTables, sql } from './db.js';
import { createGameSession } from './session-token.js';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  try {
    if (!sql) {
      send(res, 500, { error: 'Missing database configuration' });
      return;
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      send(res, 405, { error: 'Method not allowed' });
      return;
    }

    await ensureSecurityTables();
    await sql`
      delete from public.game_sessions
      where issued_at < now() - interval '1 day'
    `;
    const { session, token } = createGameSession();
    await sql`
      insert into public.game_sessions (sid, issued_at, issued_ip)
      values (${session.sid}, ${new Date(session.iat)}, ${clientIp(req)})
      on conflict (sid) do nothing
    `;
    send(res, 200, { token });
  } catch (error) {
    console.error('Game session failed', { message: error?.message, code: error?.code });
    send(res, 500, { error: 'Server error' });
  }
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

import { createGameToken } from './session-token.js';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      send(res, 405, { error: 'Method not allowed' });
      return;
    }

    send(res, 200, { token: createGameToken() });
  } catch {
    send(res, 500, { error: 'Server error' });
  }
}

// Vercel Serverless Function: grower portal API (sign-in + saved parcels/wells).
// Thin adapter over the shared core in lib/portal-core.mjs.
// Reached at /api/portal; vercel.json also rewrites the app's
// /.netlify/functions/portal calls here so index.html needs no changes.

import { handlePortal } from '../lib/portal-core.mjs';

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json');
  if (req.method !== 'POST') return res.status(405).send(JSON.stringify({ error: 'POST only' }));
  let input = req.body;
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch { input = null; } }
  const { status, body } = await handlePortal(input);
  res.status(status).send(JSON.stringify(body));
}

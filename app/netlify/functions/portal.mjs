// Netlify Function (v2): grower portal API (sign-in + saved parcels/wells).
// Thin adapter over the shared core in lib/portal-core.mjs (repo root).

import { handlePortal } from '../../../lib/portal-core.mjs';

export default async (req) => {
  const headers = { 'content-type': 'application/json' };
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers });
  const input = await req.json().catch(() => null);
  const { status, body } = await handlePortal(input);
  return new Response(JSON.stringify(body), { status, headers });
};

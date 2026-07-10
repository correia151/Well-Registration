// Netlify Function (v2): parcel boundary lookup by APN.
// Thin adapter over the shared core in lib/parcels-lookup.mjs (repo root).

import { lookupParcels, RESPONSE_HEADERS } from '../../../lib/parcels-lookup.mjs';

export default async (req) => {
  const u = new URL(req.url);
  const { status, body, pretty } = await lookupParcels(u.searchParams.get('apn'), u.searchParams.get('debug'));
  return new Response(JSON.stringify(body, null, pretty ? 2 : 0), { status, headers: RESPONSE_HEADERS });
};

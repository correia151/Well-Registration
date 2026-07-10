// Vercel Serverless Function: parcel boundary lookup by APN.
// Thin adapter over the shared core in lib/parcels-lookup.mjs.
// Reached at /api/parcels; vercel.json also rewrites the app's
// /.netlify/functions/parcels calls here so index.html needs no changes.

import { lookupParcels, RESPONSE_HEADERS } from '../lib/parcels-lookup.mjs';

export default async function handler(req, res) {
  const { apn, debug } = req.query;
  const { status, body, pretty } = await lookupParcels(apn, debug);
  for (const [k, v] of Object.entries(RESPONSE_HEADERS)) res.setHeader(k, v);
  res.status(status).send(JSON.stringify(body, null, pretty ? 2 : 0));
}

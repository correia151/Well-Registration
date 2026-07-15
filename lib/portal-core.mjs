// Grower-portal core: sign-in with an emailed 6-digit code, then load/save
// the grower's parcels and wells so they persist across visits and devices.
// Shared by both platform adapters:
//   app/netlify/functions/portal.mjs  — Netlify  (/.netlify/functions/portal)
//   api/portal.mjs                    — Vercel   (/api/portal)
//
// All database access goes through Supabase's REST API with the service role
// key, so Row Level Security stays fully locked (no policies, no anon access).
// The browser never talks to Supabase directly — only to this function.
//
// Required env vars (already set for the submit function):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY
// Optional:
//   FROM_EMAIL          — sender for sign-in codes; MUST be an address on a
//                         Resend-verified domain for codes to reach growers
//                         (the default onboarding@resend.dev only delivers to
//                         the Resend account owner).
//   PORTAL_AUTH_SECRET  — secret for signing session tokens. If unset, a
//                         secret is derived from the service role key, so no
//                         extra setup is needed; set it explicitly if you
//                         ever rotate the service key and want old grower
//                         sessions to survive.
//
// Actions (POST JSON {action, ...}):
//   request-code  {email}                       → emails a 6-digit code
//   verify-code   {email, code}                 → {token, grower, parcels, wells}
//   load          {token}                       → {grower, parcels, wells}
//   save-profile  {token, name, contact, gsa}
//   save-parcels  {token, parcels:[{apn,gsa,label,acres}]}   (replaces list)
//   save-well     {token, well:{id,label,use,status,apn,gsa,depth,no,lat,lng,notes}}
//   delete-well   {token, id}

import { createHmac, createHash, randomInt, timingSafeEqual } from 'node:crypto';

const CODE_TTL_MIN = 15;          // sign-in code lifetime
const CODE_MAX_ATTEMPTS = 5;      // wrong guesses before a code dies
const CODES_PER_10MIN = 4;        // request-code rate limit per email
const TOKEN_TTL_DAYS = 90;        // grower stays signed in this long
const MAX_WELLS = 500;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const num = x => { const n = parseFloat(x); return isFinite(n) ? n : null; };
const str = (x, max = 2000) => String(x == null ? '' : x).slice(0, max);

function secret() {
  const s = process.env.PORTAL_AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('portal not configured (SUPABASE_SERVICE_ROLE_KEY missing)');
  return createHash('sha256').update('agoptics-portal|' + s).digest();
}

/* ---------- Supabase REST helpers (service role) ---------- */

function sbConfig() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('portal not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)');
  return { base: url.replace(/\/$/, '') + '/rest/v1', key };
}

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const { base, key } = sbConfig();
  const headers = { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json' };
  if (prefer) headers.prefer = prefer;
  const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error('db ' + method + ' ' + path.split('?')[0] + ': ' + ((j && (j.message || j.error)) || r.status));
  return j;
}

/* ---------- session tokens (HMAC-signed, stateless) ---------- */

const b64u = buf => Buffer.from(buf).toString('base64url');

function signToken(growerId, email) {
  const payload = b64u(JSON.stringify({ g: growerId, e: email, x: Date.now() + TOKEN_TTL_DAYS * 86400000 }));
  const sig = b64u(createHmac('sha256', secret()).update(payload).digest());
  return payload + '.' + sig;
}

export function verifyToken(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const want = createHmac('sha256', secret()).update(payload).digest();
    const got = Buffer.from(sig, 'base64url');
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!p.g || !UUID_RE.test(p.g) || !p.x || Date.now() > p.x) return null;
    return { growerId: p.g, email: p.e };
  } catch { return null; }
}

/* ---------- sign-in codes ---------- */

const hashCode = (email, code) => createHmac('sha256', secret()).update(email + '|' + code).digest('hex');

async function requestCode({ email }) {
  email = str(email, 254).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { status: 400, body: { error: 'Enter a valid email address.' } };
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { status: 503, body: { error: 'Sign-in is not configured yet (RESEND_API_KEY missing).' } };

  const since = new Date(Date.now() - 10 * 60000).toISOString();
  const recent = await sb(`/login_codes?email=eq.${encodeURIComponent(email)}&created_at=gt.${since}&select=id`);
  if (recent.length >= CODES_PER_10MIN) return { status: 429, body: { error: 'Too many codes requested. Wait a few minutes, or use the last code we emailed you.' } };

  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  await sb('/login_codes', {
    method: 'POST',
    prefer: 'return=minimal',
    body: { email, code_hash: hashCode(email, code), expires_at: new Date(Date.now() + CODE_TTL_MIN * 60000).toISOString() },
  });

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + resendKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL || 'AgOptics Well Registration <onboarding@resend.dev>',
      to: [email],
      subject: code + ' is your AgOptics sign-in code',
      text: 'Your AgOptics Well Registration sign-in code is:\n\n    ' + code +
        '\n\nEnter it in the app within ' + CODE_TTL_MIN + ' minutes. ' +
        'If you didn’t request this, you can ignore this email.\n\n' +
        'AgOptics LLC · agoptics.ai · contact@agoptics.ai',
    }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return { status: 502, body: { error: 'Could not send the code email. Try again, or email contact@agoptics.ai.', detail: j } };
  }
  return { status: 200, body: { ok: true, message: 'Code sent — check your email (and spam folder).' } };
}

async function verifyCode({ email, code }) {
  email = str(email, 254).trim().toLowerCase();
  code = str(code, 10).replace(/\D/g, '');
  if (!EMAIL_RE.test(email) || code.length !== 6) return { status: 400, body: { error: 'Enter the 6-digit code from the email.' } };

  const nowIso = new Date().toISOString();
  const rows = await sb(`/login_codes?email=eq.${encodeURIComponent(email)}&used_at=is.null&expires_at=gt.${nowIso}&attempts=lt.${CODE_MAX_ATTEMPTS}&order=created_at.desc&limit=3`);
  const want = hashCode(email, code);
  const hit = rows.find(rw => {
    try { return timingSafeEqual(Buffer.from(rw.code_hash, 'hex'), Buffer.from(want, 'hex')); } catch { return false; }
  });
  if (!hit) {
    if (rows.length) await sb(`/login_codes?id=eq.${rows[0].id}`, { method: 'PATCH', prefer: 'return=minimal', body: { attempts: rows[0].attempts + 1 } });
    return { status: 401, body: { error: 'That code didn’t match (or expired). Check the newest email, or request a fresh code.' } };
  }
  await sb(`/login_codes?id=eq.${hit.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { used_at: nowIso } });

  const g = await sb('/growers?on_conflict=email', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: { email, last_login_at: nowIso },
  });
  const grower = g[0];
  const data = await loadData(grower.id);
  return { status: 200, body: { ok: true, token: signToken(grower.id, email), ...data } };
}

/* ---------- data load/save ---------- */

async function loadData(growerId) {
  const [growers, parcels, wells] = await Promise.all([
    sb(`/growers?id=eq.${growerId}&select=email,name,contact,gsa`),
    sb(`/grower_parcels?grower_id=eq.${growerId}&order=sort_order.asc,created_at.asc&select=apn,gsa,label,acres`),
    sb(`/grower_wells?grower_id=eq.${growerId}&order=created_at.asc&select=id,label,well_use,status,apn,gsa,depth_ft,well_no,latitude,longitude,notes`),
  ]);
  return {
    grower: growers[0] || null,
    parcels,
    wells: wells.map(w => ({
      id: w.id, label: w.label || '', use: w.well_use || '', status: w.status || '',
      apn: w.apn || '', gsa: w.gsa || '', depth: w.depth_ft == null ? '' : String(w.depth_ft),
      no: w.well_no || '', lat: w.latitude, lng: w.longitude, notes: w.notes || '',
    })),
  };
}

async function saveProfile(gid, { name, contact, gsa }) {
  await sb(`/growers?id=eq.${gid}`, {
    method: 'PATCH', prefer: 'return=minimal',
    body: { name: str(name, 300), contact: str(contact, 300), gsa: str(gsa, 100) },
  });
  return { status: 200, body: { ok: true } };
}

async function saveParcels(gid, { parcels }) {
  if (!Array.isArray(parcels)) return { status: 400, body: { error: 'parcels must be a list' } };
  await sb(`/grower_parcels?grower_id=eq.${gid}`, { method: 'DELETE', prefer: 'return=minimal' });
  const seen = new Set();
  const rows = parcels.slice(0, 2000).map((p, i) => ({
    grower_id: gid, apn: str(p.apn, 60).trim(), gsa: str(p.gsa, 100),
    label: str(p.label, 300), acres: num(p.acres), sort_order: i,
  })).filter(p => p.apn && !seen.has(p.apn) && seen.add(p.apn));
  if (rows.length) await sb('/grower_parcels', { method: 'POST', prefer: 'return=minimal', body: rows });
  return { status: 200, body: { ok: true, count: rows.length } };
}

async function saveWell(gid, { well }) {
  if (!well || !UUID_RE.test(String(well.id || ''))) return { status: 400, body: { error: 'well.id (uuid) required' } };
  const count = await sb(`/grower_wells?grower_id=eq.${gid}&select=id&limit=${MAX_WELLS + 1}`);
  const row = {
    label: str(well.label, 300), well_use: str(well.use, 60), status: str(well.status, 60),
    apn: str(well.apn, 60), gsa: str(well.gsa, 100), depth_ft: num(well.depth),
    well_no: str(well.no, 120), latitude: num(well.lat), longitude: num(well.lng),
    notes: str(well.notes, 4000), updated_at: new Date().toISOString(),
  };
  // Update scoped to this grower first; insert only if it's a new id. This way
  // one grower can never overwrite another grower's well row.
  const updated = await sb(`/grower_wells?id=eq.${well.id}&grower_id=eq.${gid}`, {
    method: 'PATCH', prefer: 'return=representation', body: row,
  });
  if (!updated.length) {
    if (count.length > MAX_WELLS) return { status: 400, body: { error: 'well limit reached' } };
    await sb('/grower_wells', { method: 'POST', prefer: 'return=minimal', body: { id: well.id, grower_id: gid, ...row } });
  }
  return { status: 200, body: { ok: true, id: well.id } };
}

async function deleteWell(gid, { id }) {
  if (!UUID_RE.test(String(id || ''))) return { status: 400, body: { error: 'id (uuid) required' } };
  await sb(`/grower_wells?id=eq.${id}&grower_id=eq.${gid}`, { method: 'DELETE', prefer: 'return=minimal' });
  return { status: 200, body: { ok: true } };
}

/* ---------- dispatcher ---------- */

export async function handlePortal(input) {
  try {
    const action = String((input && input.action) || '');
    if (action === 'request-code') return await requestCode(input);
    if (action === 'verify-code') return await verifyCode(input);

    const auth = verifyToken(input && input.token);
    if (!auth) return { status: 401, body: { error: 'signed out', signedOut: true } };
    const gid = auth.growerId;
    if (action === 'load') return { status: 200, body: { ok: true, ...await loadData(gid) } };
    if (action === 'save-profile') return await saveProfile(gid, input);
    if (action === 'save-parcels') return await saveParcels(gid, input);
    if (action === 'save-well') return await saveWell(gid, input);
    if (action === 'delete-well') return await deleteWell(gid, input);
    return { status: 400, body: { error: 'unknown action' } };
  } catch (e) {
    const msg = String((e && e.message) || e);
    return { status: /not configured/.test(msg) ? 503 : 500, body: { error: msg } };
  }
}

// Netlify Function (v2): receives the grower's "Email summary to AgOptics"
// submission (multipart form data with per-GSA CSV/KMZ files) and emails it
// to AgOptics via Resend, with the files as real attachments. This bypasses
// Netlify Forms' Akismet spam filter, which was silently diverting real
// grower submissions.
//
// Also saves the registration + wells into Supabase (best-effort: a database
// hiccup never blocks the email — the email is the delivery guarantee, the
// database is the growing archive; see supabase/schema.sql for the tables).
//
// Required env vars (Netlify → Project configuration → Environment variables):
//   RESEND_API_KEY  — API key from https://resend.com
// Optional:
//   NOTIFY_EMAIL    — recipient (default contact@agoptics.ai)
//   FROM_EMAIL      — sender; must be a Resend-verified domain address.
//                     Default onboarding@resend.dev, which Resend only
//                     delivers to the Resend account owner's own email —
//                     so sign up for Resend with contact@agoptics.ai.
//   SUPABASE_URL              — Supabase project URL (Settings → API)
//   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key (Settings → API);
//                               if unset, database saving is skipped.
//
// Until RESEND_API_KEY is set this returns 503 and the app falls back to
// the Netlify Forms submission (data still lands in the Forms dashboard).

const FILE_FIELDS = ['greater_csv', 'greater_kmz', 'mid_csv', 'mid_kmz', 'unassigned_csv'];

const num = x => { const n = parseFloat(x); return isFinite(n) ? n : null; };

async function saveToSupabase({ landowner, contact, email, gsa, summary, wellsJson }) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { saved: false, reason: 'not configured' };
  const headers = { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json', prefer: 'return=representation' };
  const post = async (path, body) => {
    const r = await fetch(url.replace(/\/$/, '') + path, { method: 'POST', headers, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(path + ': ' + (j && (j.message || j.error) || r.status));
    return j;
  };
  const reg = await post('/rest/v1/registrations', { landowner, contact, email: email || null, gsa, summary });
  const regId = reg[0].id;
  let wells = [];
  try { wells = JSON.parse(wellsJson || '[]'); } catch (e) { /* malformed wells_json — registration row still saved */ }
  if (Array.isArray(wells) && wells.length) {
    await post('/rest/v1/wells', wells.slice(0, 500).map(w => ({
      registration_id: regId,
      label: String(w.label || ''), well_use: String(w.use || ''), status: String(w.status || ''),
      apn: String(w.apn || ''), gsa: String(w.gsa || ''),
      depth_ft: num(w.depth), well_no: String(w.no || ''),
      latitude: num(w.lat), longitude: num(w.lng),
      notes: String(w.notes || ''),
    })));
  }
  return { saved: true, registrationId: regId, wellCount: Array.isArray(wells) ? wells.length : 0 };
}

export default async (req) => {
  const headers = { 'content-type': 'application/json' };
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers });
  const key = process.env.RESEND_API_KEY;
  if (!key) return new Response(JSON.stringify({ error: 'email sending not configured (RESEND_API_KEY missing)' }), { status: 503, headers });
  try {
    const fd = await req.formData();
    const v = n => String(fd.get(n) || '').slice(0, 10000);
    const landowner = v('landowner'), contact = v('contact'), email = v('email'), gsa = v('gsa'), summary = v('summary');
    if (!landowner) return new Response(JSON.stringify({ error: 'landowner required' }), { status: 400, headers });
    let db = { saved: false };
    try {
      db = await saveToSupabase({ landowner, contact, email, gsa, summary, wellsJson: String(fd.get('wells_json') || '').slice(0, 500000) });
    } catch (e) {
      db = { saved: false, reason: String(e && e.message || e) };
    }
    const attachments = [];
    for (const f of FILE_FIELDS) {
      const file = fd.get(f);
      if (file && typeof file.arrayBuffer === 'function' && file.size > 0) {
        attachments.push({ filename: file.name || f, content: Buffer.from(await file.arrayBuffer()).toString('base64') });
      }
    }
    const payload = {
      from: process.env.FROM_EMAIL || 'AgOptics Well Registration <onboarding@resend.dev>',
      to: [process.env.NOTIFY_EMAIL || 'contact@agoptics.ai'],
      subject: 'Well registration — ' + landowner + (contact ? (' (' + contact + ')') : ''),
      text: summary || ('Submission from ' + landowner + ' — ' + contact + ' — ' + gsa),
      attachments,
    };
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) payload.reply_to = email;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return new Response(JSON.stringify({ error: 'send failed', detail: j, db }), { status: 502, headers });
    return new Response(JSON.stringify({ ok: true, id: j.id, db }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers });
  }
};

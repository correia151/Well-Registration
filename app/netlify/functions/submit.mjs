// Netlify Function (v2): receives the grower's "Email summary to AgOptics"
// submission (multipart form data with per-GSA CSV/KMZ files) and emails it
// to AgOptics via Resend, with the files as real attachments. This bypasses
// Netlify Forms' Akismet spam filter, which was silently diverting real
// grower submissions.
//
// Required env vars (Netlify → Project configuration → Environment variables):
//   RESEND_API_KEY  — API key from https://resend.com
// Optional:
//   NOTIFY_EMAIL    — recipient (default contact@agoptics.ai)
//   FROM_EMAIL      — sender; must be a Resend-verified domain address.
//                     Default onboarding@resend.dev, which Resend only
//                     delivers to the Resend account owner's own email —
//                     so sign up for Resend with contact@agoptics.ai.
//
// Until RESEND_API_KEY is set this returns 503 and the app falls back to
// the Netlify Forms submission (data still lands in the Forms dashboard).

const FILE_FIELDS = ['greater_csv', 'greater_kmz', 'mid_csv', 'mid_kmz', 'unassigned_csv'];

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
    if (!r.ok) return new Response(JSON.stringify({ error: 'send failed', detail: j }), { status: 502, headers });
    return new Response(JSON.stringify({ ok: true, id: j.id }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers });
  }
};

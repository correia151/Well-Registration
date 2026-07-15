# AgOptics — Well Registration Toolkit

Everything needed to run the Kaweah Subbasin well-registration service for growers.
Built for AgOptics LLC (agoptics.ai · contact@agoptics.ai).

---

## What this does

A grower (or AgOptics on their behalf) imports their dashboard export, the app lists
every parcel and draws its boundary, you drop a pin on each wellhead, and it exports
the right file for each GSA:

- **Mid-Kaweah GSA** → a **KMZ** (parcels + wells) you submit to them.
- **Greater Kaweah GSA** → a **CSV** to key into their ArcGIS portal, plus a printable
  registration/authorization form (see `forms/`).

The app keys off APN, so it works for any customer from their Explore-Usage export.

**Grower portal (pilot study):** growers can now sign in with just their email —
the app emails them a 6-digit code, no password — and everything they do (their
info, parcel list, and every well they mark) saves automatically to the Supabase
database. They can close the app and come back any time, on any device, to add
more wells or make changes. Everything also stays cached in the browser, so even
without signing in a grower's work survives a page reload on the same device.
See "The grower portal" below for the one-time setup.

---

## Folder contents

```
app/                         The deployable website (this is the program)
  index.html                 The grower-facing app (portal sign-in, map, autosave)
  netlify/functions/
    parcels.mjs              Server-side parcel-boundary lookup (CORS-safe, countywide)
    portal.mjs               Grower portal API (sign-in codes, saved parcels/wells)
    submit.mjs               "Email summary to AgOptics" submission (Resend + archive)
  netlify.toml               Netlify functions config
lib/
  parcels-lookup.mjs         Shared parcel-lookup core (used by both platforms)
  portal-core.mjs            Shared grower-portal core: auth + database access
api/
  parcels.mjs / portal.mjs / submit.mjs   Vercel adapters for the same functions
supabase/
  schema.sql                 Database schema — paste into the Supabase SQL editor
marketing/
  AgOptics_WellRegistration_Postcard.pdf   EDDM postcard promoting the service
forms/
  AgOptics_Correia_GreaterKaweah_Registration.pdf   Example filled GK submission form
gsa_outreach/
  GSA_emails.txt             Draft emails to GK & Mid-Kaweah (batch submit + authorization)
reference/
  key_facts.md               Deadlines, contacts, the parcel service URL, workflow
  WellReg_Survey123_BuildSpec.md   Early design notes (optional)
brand_assets/
  emblem.png, logo_trim.png, wo_reversed.png   Logos used across the materials
```

---

## How to deploy the app (~2 min)

The app is a static site plus one serverless function. Easiest path:

1. Go to **https://app.netlify.com/drop**
2. Drag the **contents of the `app/` folder** onto the page (so `index.html` is at the
   site root — do NOT drag a parent folder above it).
3. Netlify gives you a live URL like `https://your-site.netlify.app`. Open it on a phone.
4. (Optional) In Site settings, rename it or point a subdomain such as
   `register.agoptics.ai` at it.

CLI alternative: `npm i -g netlify-cli` then `cd app && netlify deploy --prod`.

---

## The grower workflow (in the app)

0. **Sign in (recommended)** — enter an email, get a 6-digit code, done. From
   here on everything below autosaves to their account so they can return to
   add more wells or make changes any time, from any device.
1. **Import** the dashboard "Explore Usage" export (.xlsx). The app auto-detects the
   APN / GSA / field-name columns, fills the landowner name, and lists every parcel
   color-coded by GSA (green = Greater Kaweah, blue = Mid-Kaweah).
2. **Show parcels** — boundaries draw from the county parcel layer. Tap a parcel to
   select it (you can also select from the list if a rural boundary doesn't draw).
3. **Mark wells** — tap each wellhead on the satellite map. Each pin is auto-tagged to
   the parcel's APN and GSA (point-in-polygon).
4. **Send** — tap "Email summary to AgOptics": the app submits the well data to
   AgOptics via Netlify Forms — a CSV and a KMZ per subbasin (Greater Kaweah /
   Mid-Kaweah, plus an Unassigned CSV if any well didn't auto-tag). AgOptics
   (contact@agoptics.ai) then submits to each GSA. A "Download all wells (CSV)"
   button is also offered, and if the form submission fails the app falls back
   to downloading the CSV and opening a pre-filled email.

Submissions are emailed directly to contact@agoptics.ai with the CSV/KMZ files
attached, via `app/netlify/functions/submit.mjs` and Resend (requires the
`RESEND_API_KEY` environment variable in Netlify — see the comments in that
file). This bypasses Netlify Forms' Akismet spam filter, which was silently
diverting real grower submissions. If the function is unavailable, the app
falls back to submitting to Netlify Forms (data lands under **Forms →
well-registration** in the Netlify dashboard — check the **Spam** tab there,
since Akismet flags most of these submissions).

---

## The grower portal (pilot study)

How it works for a grower:

1. Open the app, type their **email address**, tap **"Email me a code"**.
2. Enter the **6-digit code** from the email — they're signed in (no password,
   and the sign-in lasts ~90 days on that device).
3. Everything saves automatically from then on: their name/contact/GSA, their
   imported parcel list, and every well they add, edit, or delete. A small
   **"Saved ✓"** pill in the account bar shows sync status.
4. They can leave and come back later — on the same phone or a different
   device — sign in with a fresh code, and all their parcels and wells load
   right back onto the map for more marking or corrections.

Where the data lives: the Supabase project → **Table Editor** →
`growers`, `grower_parcels`, `grower_wells` (the live, editable set per
account). The original `registrations` + `wells` tables still archive each
"Email summary to AgOptics" submission, now linked to the grower's account
via `registrations.grower_id` when they were signed in.

### One-time setup (~5 min)

1. **Database:** Supabase dashboard → SQL Editor → paste all of
   `supabase/schema.sql` → Run. (Safe to re-run — it only adds what's new:
   `growers`, `login_codes`, `grower_parcels`, `grower_wells`, and a
   `grower_id` column on `registrations`.)
2. **Env vars:** none new required — the portal reuses `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, and `RESEND_API_KEY`, which are already set
   for the submit function.
3. **Important — sign-in code delivery:** Resend's default sender
   (`onboarding@resend.dev`) only delivers to the Resend account owner's own
   inbox, which is fine for testing but means **growers won't receive codes**
   until you verify a domain: Resend dashboard → Domains → add `agoptics.ai`
   (or a subdomain) → add the DNS records it shows → then set the env var
   `FROM_EMAIL` to something like
   `AgOptics <register@agoptics.ai>` and redeploy. This also makes the
   submission emails deliverable to any recipient.
4. Optional: set `PORTAL_AUTH_SECRET` (any long random string) to sign grower
   sessions. If unset, a secret is derived from the service role key —
   fine for the pilot; the only effect is that rotating the service key
   signs everyone out.

Security model: the browser never talks to Supabase — Row Level Security
stays fully locked with no policies, and all reads/writes go through the
`portal` serverless function, which checks the grower's signed session token
and only ever touches that grower's own rows. Sign-in codes are stored
hashed, expire in 15 minutes, allow 5 attempts, and are rate-limited to 4
per email per 10 minutes.

---

## Maintenance note (important)

The boundary lookup depends on Tulare County's public parcel service:

`https://services2.arcgis.com/bYBANhmQGwSSLC0l/arcgis/rest/services/Parcels_(Public_View)/FeatureServer/0`

(with `Retired_Parcels` and the City-of-Tulare layer as fallbacks). If parcels ever
stop drawing, that URL is the first thing to recheck — county orgs occasionally rename
or republish layers. Diagnose with:

`https://YOUR-SITE.netlify.app/.netlify/functions/parcels?apn=073-110-035&debug=1`

You want `matchedFeatures: 1`. The `attempts` list shows which field matched.

---

## Open items / nice-to-haves

- Postcard: fill in the **street address** and **postage permit number** before printing.
- Capture **depth** and **State Well No.** per well if a GSA requires them (not collected yet).
- Make the GK form template-driven so it auto-generates per customer from their CSV.
- Confirm with Greater Kaweah whether they accept the printable form as a direct
  submission in addition to portal entry.

See `reference/key_facts.md` for deadlines and GSA contacts.

---

## Development & deployment (Git-based)

This repo lives at **github.com/correia151/well-registration** and deploys
automatically on every push — the repo supports **both Vercel and Netlify**
with no build step (plain HTML + one serverless function).

How it's wired:

- `app/` is the published site (`index.html` is the whole app).
- `lib/parcels-lookup.mjs` is the parcel-boundary lookup logic, shared by both
  platform adapters — **edit this file to change lookup behavior**:
  - `api/parcels.mjs` — Vercel serverless function (`/api/parcels`)
  - `app/netlify/functions/parcels.mjs` — Netlify function
- `vercel.json` publishes `app/` and rewrites the app's
  `/.netlify/functions/parcels` calls to `/api/parcels`, so the same
  `index.html` works on either platform unchanged.
- `netlify.toml` (repo root) publishes `app/` and bundles the Netlify function.
- Parcel boundaries come from public county ArcGIS services (Tulare County layers
  first, then the Kings County Assessor layer for the western Greater Kaweah
  sliver near Hanford — see `reference/key_facts.md` for URLs and APN formats).
- Test the parcel function after a deploy:
  `/.netlify/functions/parcels?apn=118-060-005&debug=1` (Tulare)
  `/.netlify/functions/parcels?apn=016-090-004&debug=1` (Kings)
  (on Vercel, `/api/parcels?apn=...&debug=1` also works)

### Deploying on Vercel (one-time setup)

1. Go to **https://vercel.com/new**, sign in with GitHub, and import
   `correia151/well-registration`.
2. Leave every setting as detected (no framework, no build command —
   `vercel.json` already tells Vercel to publish `app/`). Click **Deploy**.
3. Done — every push to the repo's default branch deploys to production
   automatically; pushes to other branches get preview URLs.
4. (Optional) In the Vercel project settings → Domains, add
   `register.agoptics.ai`.

Local development:

```bash
npm i -g vercel        # once
vercel dev             # serves the site + /api function locally
```

(or the Netlify equivalent: `npm i -g netlify-cli` then `netlify dev`)

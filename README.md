# AgOptics — Well Registration Toolkit

Everything needed to run the Kaweah Subbasin well-registration service for growers.
Built for AgOptics LLC (agoptics.ai · Admin@agoptics.ai).

---

## What this does

A grower (or AgOptics on their behalf) imports their dashboard export, the app lists
every parcel and draws its boundary, you drop a pin on each wellhead, and it exports
the right file for each GSA:

- **Mid-Kaweah GSA** → a **KMZ** (parcels + wells) you submit to them.
- **Greater Kaweah GSA** → a **CSV** to key into their ArcGIS portal, plus a printable
  registration/authorization form (see `forms/`).

The app keys off APN, so it works for any customer from their Explore-Usage export.

---

## Folder contents

```
app/                         The deployable website (this is the program)
  index.html                 The grower-facing app (runs entirely in the browser)
  netlify/functions/
    parcels.mjs              Server-side parcel-boundary lookup (CORS-safe, countywide)
  netlify.toml               Netlify functions config
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

1. **Import** the dashboard "Explore Usage" export (.xlsx). The app auto-detects the
   APN / GSA / field-name columns, fills the landowner name, and lists every parcel
   color-coded by GSA (green = Greater Kaweah, blue = Mid-Kaweah).
2. **Show parcels** — boundaries draw from the county parcel layer. Tap a parcel to
   select it (you can also select from the list if a rural boundary doesn't draw).
3. **Mark wells** — tap each wellhead on the satellite map. Each pin is auto-tagged to
   the parcel's APN and GSA (point-in-polygon).
4. **Export** — get the Mid-Kaweah KMZ and the Greater Kaweah CSV, then submit each to
   the right GSA. A summary email to Admin@agoptics.ai is also offered.

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
- Optional: auto-submission (a Netlify form/function) so exports land in your inbox or a
  sheet instead of being emailed as attachments.
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

# Well Registration Intake — Survey123 Build Spec

**Owner:** AgOptics LLC
**Purpose:** Collect the well data the Kaweah GSAs require, with everything we already hold pre-filled, so the grower only supplies the wellhead location and a few facts we can't know. Output feeds a hosted feature layer that we review and submit to the GSA.

---

## Design principles
- **Pre-fill everything we hold** (landowner, contact, APNs, GSA, parcels). The grower confirms rather than types.
- **One personalized link per grower**, carrying a token that drives the pre-fill.
- **Wells as a repeat group** — one grower can register multiple wells in a single pass.
- **Works offline**, syncs on reconnect (wells are often in dead zones).

---

## Survey schema

### Page 1 — Confirm landowner & parcel *(pre-filled, editable)*
| Field | Type | Notes |
|---|---|---|
| Landowner name | text | pre-filled |
| Phone / email / mailing address | text | pre-filled |
| GSA | select_one (Greater Kaweah, Mid-Kaweah) | pre-filled from parcel; routes submission |
| APN(s) | text / list | pre-filled |

### Page 2 — Wells *(repeat group: "Add another well")*
| Field | Type | Required | Notes |
|---|---|---|---|
| Wellhead location | geopoint | yes | map tap; default-center on grower parcels, satellite basemap |
| Well name/label | text | yes | the grower's own label |
| Well use | select_one | yes | Agricultural / Domestic / Industrial / Retired (non-destroyed) |
| Well status | select_one | yes | Active / Inactive / Retired |
| Well depth (ft) | integer | no | many won't know |
| State Well No. / completion-report no. | text | no | |
| Well completion report | file | no | PDF/image upload |
| Wellhead photo | image | no | cheap verification |
| Notes | text | no | |

### Page 3 — Authorize & submit
| Field | Type | Required | Notes |
|---|---|---|---|
| Authorization | select_one (yes/no) | yes | grower confirms AgOptics may submit on their behalf |
| Submit | — | — | |

---

## Pre-fill mechanism
Two options, in order of preference:
1. **`pulldata()` from a hosted table** keyed by a per-grower token. Maintain one row per client (name, contact, APNs, GSA). Generate one link per client; form opens fully populated.
2. **Custom URL parameters** — encode the same values in the link query string. Simpler to start, but the link gets long and exposes values in plain text.

The grower's job reduces to: confirm header → drop a pin per well → label it → submit.

---

## Settings
- **Map:** satellite/imagery basemap; default extent = bounding box of that grower's parcels; overlay parcel boundaries (from Land IQ) so the wellhead is easy to find.
- **Offline:** enable in Survey123 field app; allow draft save and later sync.
- **Geopoint accuracy:** prompt for GPS where available; allow manual map placement as fallback.

---

## Data output & handoff
- Submissions land in a **hosted feature layer** (one point per well, parent record per grower).
- We **review and export** (CSV or feature layer), then submit to the GSA.
- **Open item to confirm with each GSA:** whether they accept a consultant-submitted batch (and in what format), or whether each record must be entered through their own portal. Greater Kaweah's portal is an ArcGIS Experience app, which makes a feature-layer or CSV handoff plausible — needs confirmation.

---

## Reference — what the GSA asks for
Well location (APN/address/GPS), well use, well status, landowner info, and well completion report if available. The geopoint + dropdowns + optional file above cover all of it.

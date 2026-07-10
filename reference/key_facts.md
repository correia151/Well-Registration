# Key Facts — Kaweah Well Registration

## GSA routing & deadlines
- **Greater Kaweah GSA (GKGSA)** — well registration is **MANDATORY**, deadline
  **July 1, 2026**. Entries are made in their **ArcGIS Experience portal** (manual).
  The app exports a CSV to key from; `forms/` has a printable submission + authorization form.
- **Mid-Kaweah GSA (MKGSA)** — accepts **KMZ file** submissions (parcels + wells).
  The app exports the Mid-Kaweah KMZ directly.
- **East Kaweah GSA (EKGSA)** — not yet wired into the tool; documents/coverage TBD.

## GSA contacts
- Greater Kaweah GSA — info@greaterkaweahgsa.org · (559) 302-9987 (mgr: Mark Larsen)
- Mid-Kaweah GSA — jmf@tulareid.org / midkaweah@gmail.com · (559) 686-3425
- East Kaweah GSA — groundwater@ekgsa.org · (559) 697-6095

## AgOptics
- Web: agoptics.ai · Email: Admin@agoptics.ai
- Product: WaterOptics (decision support; not a system of record)

## Data sources
- Grower data: Kaweah GSAs **Water Dashboard** — dashboard.gsawd.com (Land IQ–based).
  Export used = "Explore Usage" .xlsx (APNs + ET; no geometry). Field geometry lives in
  the dashboard's "Farm Map" (login-gated; no public API).
- Parcel boundaries (countywide, public, by APN):
  `https://services2.arcgis.com/bYBANhmQGwSSLC0l/arcgis/rest/services/Parcels_(Public_View)/FeatureServer/0`
- Kings County parcels (for the western Greater Kaweah sliver near Hanford; APN books
  like 016-xxx-xxx; APNs stored as 12 digits with a trailing 3-digit suffix, e.g.
  `016090004000`):
  `https://services3.arcgis.com/24gLq1DBBzDfd0cZ/arcgis/rest/services/Parcel_view/FeatureServer/143`
  Found via the county open-data hub: gis-tularecounty.opendata.arcgis.com
  Fallbacks in the app: `Retired_Parcels/FeatureServer/0` (same org), then the
  City-of-Tulare layer at maps.tulare.ca.gov (city-limits coverage only).

## How the app stays accurate / liability notes
- The app is fully deterministic — **no AI / no API keys**. APN tagging is point-in-polygon math.
- It is a collection/submission aid, not the system of record.
- Grower-specific allocation numbers are NOT handled here — those belong in WaterOptics.

## Verifying an export before filing
- KMZ: open in Google Earth; confirm only the intended GSA's parcels are present and that
  every parcel that should have a well has a pin. (Point-in-polygon already ensures each
  well sits inside its tagged parcel.)
- CSV: confirm APN, GSA, and lat/long per row.

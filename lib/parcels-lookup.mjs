// Kaweah Subbasin parcel boundary lookup by APN (server-side core).
// Shared by both deployment targets:
//   - Netlify:  app/netlify/functions/parcels.mjs
//   - Vercel:   api/parcels.mjs
// Covers BOTH counties the subbasin touches:
//   - Tulare County "Current Parcels (Public View)" (countywide), with Retired Parcels
//     and the City-of-Tulare layer as fallbacks.
//   - Kings County "Parcel_view" (Assessor web-map layer) — needed for the western
//     Greater Kaweah sliver near Hanford (APN books like 016-xxx-xxx).
// Discovers the APN field at runtime; matches format-agnostically (dashes / leading
// zeros / Kings' 12-digit form with a 3-digit assessor suffix, e.g. 016090004000).
// Returns a GeoJSON FeatureCollection (WGS84). Pass debug for diagnostics.

const LAYERS = [
  // Tulare County
  'https://services2.arcgis.com/bYBANhmQGwSSLC0l/arcgis/rest/services/Parcels_(Public_View)/FeatureServer/0',
  'https://services2.arcgis.com/bYBANhmQGwSSLC0l/arcgis/rest/services/Retired_Parcels/FeatureServer/0',
  'https://maps.tulare.ca.gov/server/rest/services/Hosted/Public_Parcels__Tulare_County/FeatureServer/0',
  // Kings County (Assessor parcel layer used by the county's Parcel & Services viewer)
  'https://services3.arcgis.com/24gLq1DBBzDfd0cZ/arcgis/rest/services/Parcel_view/FeatureServer/143',
];

const norm = v => String(v == null ? '' : v).replace(/\D/g, '').replace(/^0+/, '');

// True if a stored APN value refers to the requested APN.
// Accepts exact matches plus a 3-digit assessor suffix on either side
// (Kings County stores book-page-parcel + "000", e.g. 016-090-004 -> 016090004000).
function apnMatch(v, tgt) {
  const n = norm(v);
  if (!n || !tgt) return false;
  if (n === tgt) return true;
  if (n.length === tgt.length + 3 && n.startsWith(tgt)) return true;
  if (tgt.length === n.length + 3 && tgt.startsWith(n)) return true;
  return false;
}

function chunks(apn) {
  const parts = String(apn).split(/[^0-9A-Za-z]+/).filter(Boolean);
  const digits = String(apn).replace(/\D/g, '');
  const pageParcel = digits.length > 3 ? digits.slice(3) : digits;          // 110035
  const pageParcelDash = parts.length >= 3 ? parts.slice(1).join('-') : pageParcel; // 110-035
  // Precise candidates first (full APN forms) — these rarely over-match, so the
  // true parcel can't get crowded out of the 50-record window by lookalikes.
  const precise = [...new Set([parts.join('-'), digits, digits.replace(/^0+/, '')])].filter(Boolean);
  // Loose candidates (page-parcel only) — kept for Tulare fields that store
  // partial APN formats; only used if the precise pass finds nothing.
  const loose = [...new Set([pageParcelDash, pageParcel])].filter(c => c && !precise.includes(c));
  return { precise, loose };
}

const fieldCache = {};
async function apnFields(layerUrl) {
  if (fieldCache[layerUrl]) return fieldCache[layerUrl];
  let fields;
  try {
    const r = await fetch(layerUrl + '?f=json');
    const j = await r.json();
    const str = (j.fields || []).filter(f => /string/i.test(f.type || ''));
    const re = /apn|parcel|asmt|^ain$|assess/i;
    const named = str.filter(f => re.test(f.name || '') || re.test(f.alias || '')).map(f => f.name);
    fields = named.length ? named : ['APN', 'apn', 'apn11', 'apn12', 'apn15', 'PARCEL', 'ASMT', 'AIN'];
  } catch (e) {
    fields = ['APN', 'apn', 'apn11', 'apn12', 'apn15', 'PARCEL', 'ASMT', 'AIN'];
  }
  fieldCache[layerUrl] = fields;
  return fields;
}

async function queryLayer(layerUrl, apn, diag) {
  const fields = await apnFields(layerUrl);
  const { precise, loose } = chunks(apn);
  const q = s => s.replace(/'/g, "''");
  const tgt = norm(apn);
  for (const cks of [precise, loose]) {
    if (!cks.length) continue;
    for (const field of fields) {
      const where = cks.map(c => `${field} LIKE '%${q(c)}%'`).join(' OR ');
      const url = layerUrl + '/query?where=' + encodeURIComponent(where) +
        '&outFields=*&outSR=4326&returnGeometry=true&resultRecordCount=50&f=geojson';
      try {
        const r = await fetch(url);
        if (!r.ok) { if (diag) diag.push({ layerUrl, field, status: r.status }); continue; }
        const gj = await r.json();
        if (gj.error) { if (diag) diag.push({ layerUrl, field, error: gj.error.message }); continue; }
        const feats = (gj.features || []).filter(ft =>
          Object.values(ft.properties || {}).some(v => apnMatch(v, tgt)));
        if (diag) diag.push({ layerUrl, field, returned: (gj.features || []).length, matched: feats.length });
        if (feats.length) return { type: 'FeatureCollection', features: feats };
      } catch (e) { if (diag) diag.push({ layerUrl, field, exception: String(e) }); }
    }
  }
  return null;
}

// Runs the lookup and returns { status, body } ready to serialize.
// Response headers to use alongside: content-type json, CORS *, cache 300s.
export const RESPONSE_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=300',
};

export async function lookupParcels(apn, debug) {
  if (!apn) return { status: 400, body: { error: 'apn required' } };
  const diag = debug ? [] : null;
  let result = null;
  for (const layer of LAYERS) { result = await queryLayer(layer, apn, diag); if (result) break; }
  if (debug) {
    return {
      status: 200,
      body: { apn, matchedFeatures: result ? result.features.length : 0, fieldsByLayer: fieldCache, attempts: diag },
      pretty: true,
    };
  }
  return { status: 200, body: result || { type: 'FeatureCollection', features: [] } };
}

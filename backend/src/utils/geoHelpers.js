/**
 * Backend geospatial helpers (CommonJS).
 * Shared by routes that need to decode PostGIS geography values returned by
 * the Supabase REST client (which come back as EWKB hex, not WKT).
 */

/**
 * Parse a PostGIS EWKB hex string into { lat, lon }.
 * EWKB layout: 1B byte-order + 4B type + 4B SRID (if present) + 8B X(lon) + 8B Y(lat).
 * Returns null if the input isn't a decodable point within valid lat/lon ranges.
 * @param {string} hex
 * @returns {{lat:number, lon:number}|null}
 */
function parseWkbPoint(hex) {
  if (!hex || typeof hex !== 'string' || hex.length < 42) return null;
  try {
    const isLE = hex.slice(0, 2) === '01';
    // EWKB with SRID present is 50 hex chars (header 18); plain WKB header is 10.
    const hasSrid = hex.length >= 50;
    const offset = hasSrid ? 18 : 10;
    if (hex.length < offset + 32) return null;

    const lonBuf = Buffer.from(hex.slice(offset, offset + 16), 'hex');
    const latBuf = Buffer.from(hex.slice(offset + 16, offset + 32), 'hex');
    const lon = isLE ? lonBuf.readDoubleLE(0) : lonBuf.readDoubleBE(0);
    const lat = isLE ? latBuf.readDoubleLE(0) : latBuf.readDoubleBE(0);

    if (Number.isNaN(lat) || Number.isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return null;
    }
    return { lat, lon };
  } catch {
    return null;
  }
}

module.exports = { parseWkbPoint };

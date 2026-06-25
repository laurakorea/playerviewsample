export function decodeWKBPoint(hex) {
  if (!hex) return null;
  const lonHex = hex.slice(18, 34);
  const latHex = hex.slice(34, 50);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  const parse = (h) => {
    for (let i = 0; i < 8; i++) view.setUint8(i, parseInt(h.slice(i * 2, i * 2 + 2), 16));
    return view.getFloat64(0, true);
  };
  return { lon: parse(lonHex), lat: parse(latHex) };
}

export function distanceMeters(p1, p2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lon - p1.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function formatDistance(meters) {
  if (meters < 1000) return `약 ${meters}m`;
  return `약 ${(meters / 1000).toFixed(1)}km`;
}

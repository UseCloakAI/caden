// Where this home is: coordinates + a place name, for weather and local answers.
// Device location if the browser already allows it (never prompts on its own),
// else a free IP lookup. Reverse-geocoded by BigDataCloud's free client API.
// Cached for six hours. Only coarse coordinates (2 decimals, ~1 km) leave the device.
const KEY = 'caden.where';
const TTL = 6 * 3600e3;
const round = (n) => Math.round(n * 100) / 100;

async function fromDevice(ask) {
  if (!navigator.geolocation) return null;
  if (!ask) {
    const st = await navigator.permissions?.query({ name: 'geolocation' }).catch(() => null);
    if (st?.state !== 'granted') return null;
  }
  return new Promise((res) => navigator.geolocation.getCurrentPosition(
    (p) => res({ lat: p.coords.latitude, lon: p.coords.longitude, how: 'device' }),
    () => res(null), { timeout: 6000, maximumAge: TTL }));
}

async function fromIp() {
  const r = await fetch('https://get.geojs.io/v1/ip/geo.json');
  if (!r.ok) return null;
  const j = await r.json();
  return { lat: +j.latitude, lon: +j.longitude, place: [j.city, j.region, j.country_code].filter(Boolean).join(', '), country: j.country_code, how: 'ip' };
}

async function name(w) {
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${w.lat}&longitude=${w.lon}&localityLanguage=en`);
    const j = await r.json();
    w.place = [j.city || j.locality, j.principalSubdivision, j.countryCode].filter(Boolean).join(', ') || w.place;
    w.country = j.countryCode || w.country;
  } catch { /* keep the IP name */ }
  return w;
}

let pending = null;
export async function where({ ask = false, fresh = false } = {}) {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (c && !fresh && Date.now() - c.at < TTL && !(ask && c.how === 'ip')) return c;
  } catch { /* ignore */ }
  if (pending) return pending;
  pending = (async () => {
    try {
      let w = (await fromDevice(ask)) || (await fromIp());
      if (!w || !isFinite(w.lat)) return null;
      w = await name(w);
      w.lat = round(w.lat); w.lon = round(w.lon); w.at = Date.now();
      w.units = ['US', 'LR', 'MM'].includes(w.country) ? 'imperial' : 'metric';
      localStorage.setItem(KEY, JSON.stringify(w));
      return w;
    } catch { return null; } finally { pending = null; }
  })();
  return pending;
}

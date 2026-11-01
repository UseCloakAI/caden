// Spoken: rewrite text the way a person would say it, right before it's
// spoken (Magpie or the device voice). Captions keep the written form.
// Free, instant, no network: times, temperatures, percentages, speeds,
// money, dates, ordinals, ranges, fractions and common symbols.
//
//   spoken("It's 9:05 AM and 61°F, 20% chance of rain, wind 12 mph.")
//   → "It's nine oh five A M and sixty one degrees, twenty percent chance of rain, wind twelve miles per hour."

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORD = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
const MONTHS = { jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August', sep: 'September', sept: 'September', oct: 'October', nov: 'November', dec: 'December' };

export function words(n) {
  n = Math.round(Number(n));
  if (!isFinite(n)) return '';
  if (n < 0) return 'minus ' + words(-n);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + words(n % 100) : '');
  for (const [v, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) {
    if (n >= v) return words(Math.floor(n / v)) + ' ' + name + (n % v ? ' ' + words(n % v) : '');
  }
  return String(n);
}
export function ordinal(n) {
  const w = words(n).split(' ');
  const last = w.pop();
  const o = ORD[last] || (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th');
  return [...w, o].join(' ');
}
// 3.5 → "three point five", 1,250 → "one thousand two hundred fifty"
function decimal(s) {
  const t = String(s).replace(/,/g, '');
  const [i, f] = t.split('.');
  return words(+i) + (f ? ' point ' + f.split('').map((d) => ONES[+d]).join(' ') : '');
}
// years read as pairs: 2026 → "twenty twenty six", 1999 → "nineteen ninety nine", 2005 → "two thousand five"
function year(y) {
  y = +y;
  if (y >= 2000 && y < 2010) return words(y);
  const a = Math.floor(y / 100), b = y % 100;
  return words(a) + ' ' + (b === 0 ? 'hundred' : b < 10 ? 'oh ' + words(b) : words(b));
}
// 9:05 → "nine oh five", 7:00 → "seven o'clock" (or "seven" before am/pm), 12:00 pm → "twelve noon"
function clock(h, m, ap) {
  h = +h; m = +m;
  const a = ap ? ap.replace(/\./g, '').toLowerCase() : '';
  if (h === 12 && m === 0 && a === 'pm') return 'twelve noon';
  if (h === 0 && m === 0 && !a) return 'midnight';
  let hh = h;
  if (!a && h > 12) hh = h - 12; // 17:30 → five thirty P M
  const tail = a ? ' ' + a.toUpperCase().split('').join(' ') : h > 12 ? ' P M' : '';
  const mm = m === 0 ? (a || h > 12 ? '' : " o'clock") : m < 10 ? ' oh ' + ONES[m] : ' ' + words(m);
  return words(hh === 0 ? 12 : hh) + mm + tail;
}

export function spoken(text) {
  let s = String(text || '');
  // times: 9:05 AM, 9:05am, 17:30, 9 am, 9 p.m.
  const AP = '([ap](?:\\.m\\.|m\\b))';
  s = s.replace(new RegExp(`\\b(\\d{1,2}):(\\d{2})(?:\\s*${AP})?(?!\\d)`, 'gi'), (_, h, m, ap) => clock(h, m, ap));
  s = s.replace(new RegExp(`\\b(\\d{1,2})\\s*${AP}`, 'gi'), (_, h, ap) => clock(h, 0, ap));
  // temperatures: 61°F, 61 °F, -3°C, 61°, ranges 58-64°F
  s = s.replace(/(-?\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(-?\d+(?:\.\d+)?)\s*°\s*[FC]?/g, (_, a, b) => `${decimal(a).replace(/^-/, 'minus ')} to ${decimal(b)} degrees`);
  s = s.replace(/(-?\d+(?:\.\d+)?)\s*°\s*([FC])?\b/g, (_, n, u) => `${n.startsWith('-') ? 'minus ' + decimal(n.slice(1)) : decimal(n)} degree${Math.abs(+n) === 1 ? '' : 's'}`);
  s = s.replace(/°/g, ' degrees');
  // percent, speeds, distances, weights
  s = s.replace(/(\d+(?:\.\d+)?)\s*%/g, (_, n) => `${decimal(n)} percent`);
  const UNITS = { mph: 'miles per hour', 'km/h': 'kilometers per hour', kph: 'kilometers per hour', km: 'kilometers', mi: 'miles', kg: 'kilograms', lbs: 'pounds', lb: 'pounds', oz: 'ounces', ml: 'milliliters', cm: 'centimeters', mm: 'millimeters', ft: 'feet', in: 'inches', hr: 'hours', hrs: 'hours', min: 'minutes', mins: 'minutes', sec: 'seconds', secs: 'seconds', mg: 'milligrams', tbsp: 'tablespoons', tsp: 'teaspoons' };
  s = s.replace(/(\d+(?:\.\d+)?)\s*(mph|km\/h|kph|km|mi|kg|lbs?|oz|ml|cm|mm|ft|hrs?|mins?|secs?|mg|tbsp|tsp)\b/gi, (_, n, u) => `${decimal(n)} ${UNITS[u.toLowerCase()]}`.replace(/^one (\w+)s\b/, 'one $1'));
  // money: $4.50, $1,200, €20
  s = s.replace(/([$€£])\s?(\d[\d,]*)(?:\.(\d{2}))?\b/g, (_, c, d, cents) => {
    const name = { $: ['dollar', 'dollars'], '€': ['euro', 'euros'], '£': ['pound', 'pounds'] }[c];
    const n = +d.replace(/,/g, '');
    return `${words(n)} ${n === 1 ? name[0] : name[1]}${cents && +cents ? ' ' + words(+cents) : ''}`;
  });
  // dates: Nov 2, November 2nd, 2026
  s = s.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/g, (_, mo, d) => `${MONTHS[mo.toLowerCase()]} ${ordinal(+d)}`);
  s = s.replace(/\b(1[89]\d\d|20\d\d)\b/g, (_, y) => year(y));
  s = s.replace(/\b(\d+)(st|nd|rd|th)\b/g, (_, n) => ordinal(+n));
  // fractions and ranges
  s = s.replace(/\b1\/2\b/g, 'a half').replace(/\b1\/4\b/g, 'a quarter').replace(/\b3\/4\b/g, 'three quarters');
  s = s.replace(/\b(\d+)\s*[-–]\s*(\d+)\b/g, (_, a, b) => `${words(+a)} to ${words(+b)}`);
  // symbols
  s = s.replace(/\s&\s/g, ' and ').replace(/\s\+\s/g, ' plus ').replace(/\s=\s/g, ' equals ').replace(/\s[x×]\s(?=\d)/g, ' times ');
  s = s.replace(/\be\.g\./gi, 'for example').replace(/\bi\.e\./gi, 'that is').replace(/\betc\./gi, 'and so on').replace(/\bvs\.?\b/gi, 'versus');
  s = s.replace(/\bUV\b/g, 'U V');
  // remaining numbers (with commas / decimals)
  s = s.replace(/-?\d[\d,]*(?:\.\d+)?/g, (n) => (n.startsWith('-') ? 'minus ' + decimal(n.slice(1)) : decimal(n)));
  return s.replace(/\s{2,}/g, ' ').trim();
}

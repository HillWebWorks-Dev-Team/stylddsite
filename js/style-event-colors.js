/** Style-colored accents for booking rows (port of styleEventColors). */

const PALETTE = [
  { accent: '#7D4E62', fill: '#7D4E62', border: '#663F4F' },
  { accent: '#4E5F7D', fill: '#4E5F7D', border: '#3F4D66' },
  { accent: '#5F6B4E', fill: '#5F6B4E', border: '#4D563F' },
  { accent: '#7D5F4E', fill: '#7D5F4E', border: '#664D3F' },
  { accent: '#5F4E7D', fill: '#5F4E7D', border: '#4D3F66' },
  { accent: '#4E737D', fill: '#4E737D', border: '#3F5C66' },
  { accent: '#737D4E', fill: '#737D4E', border: '#5C663F' },
  { accent: '#4E7D6A', fill: '#4E7D6A', border: '#3F6655' },
];

const COMPLETED = { accent: '#3D6B52', fill: '#3D6B52', border: '#315743' };

function hashString(value) {
  let h = 0;
  const s = String(value || 'default');
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getCalendarEventColors(opts) {
  opts = opts || {};
  if (opts.completed) {
    return { ...COMPLETED };
  }
  const key = opts.styleId || opts.title || 'default';
  const colors = PALETTE[hashString(key) % PALETTE.length];
  return { accent: colors.accent, border: colors.border, fill: colors.fill };
}

/** Style-colored accents for booking rows (port of styleEventColors). */

const PALETTE = ['#ff2d8a', '#db2777', '#f472b6', '#ec4899', '#a855f7', '#6366f1', '#14b8a6', '#f59e0b'];
const COMPLETED = '#22c55e';

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
    return { accent: COMPLETED, border: COMPLETED, fill: COMPLETED + '33' };
  }
  const key = opts.styleId || opts.title || 'default';
  const color = PALETTE[hashString(key) % PALETTE.length];
  return { accent: color, border: color, fill: color + '33' };
}

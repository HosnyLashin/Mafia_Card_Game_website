const HIDDEN = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

function normalize(raw) {
  if (typeof raw !== 'string') return null;
  return raw.replace(HIDDEN, '').replace(/\s+/g, ' ').trim();
}

export function cleanName(raw) {
  const text = normalize(raw);
  return text && text.length <= 20 ? text : null;
}

export function cleanMessage(raw, max = 200) {
  const text = normalize(raw);
  return text ? text.slice(0, max) : null;
}

export const fmtDate = (d, locale = 'en-GB') => (d ? new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtTime = (d, locale = 'en-GB') => (d ? new Date(d).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDateTime = (d, locale = 'en-GB') => (d ? new Date(d).toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
export const timeAgo = (d, t) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return t('just now');
  const m = Math.round(s / 60); if (m < 60) return t('{n} min ago', { n: m });
  const h = Math.round(m / 60); if (h < 24) return t('{n} h ago', { n: h });
  return t('{n} d ago', { n: Math.round(h / 24) });
};

/** Translate a {key, vars, dateVar} message; formats a date var and translates package names. */
export function msg(t, m, locale) {
  if (!m) return '';
  if (typeof m === 'string') return t(m);
  const vars = { ...(m.vars || {}) };
  if (m.dateVar && vars[m.dateVar]) vars[m.dateVar] = fmtDate(vars[m.dateVar], locale);
  if (vars.name) vars.name = t(vars.name);
  return t(m.key, vars);
}

export const STATUS_BADGE = {
  Queued: 'orange', Processing: 'blue', 'Sent to White Label': 'blue', Retrying: 'orange',
  Success: 'green', Failed: 'red', Cancelled: 'gray', Pending: 'orange', Rejected: 'red', Refunded: 'gray',
  Approved: 'blue', Active: 'green', Inactive: 'gray', Expired: 'red', 'Refunded (Locked)': 'red', 'No package': 'gray', Paid: 'green',
};

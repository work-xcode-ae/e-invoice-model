// Outgoing messages (NTF-01, NTF-02, INT-03): in-app, email and WhatsApp Business, never SMS.
// Every event uses a bilingual template from Settings → Templates. In this demo nothing leaves the
// browser: messages are written to an outbox that the admin can read (Admin → Settings → Outbox).
import { read, write, getUserById } from './api';
import { getPlatform } from './platform';
import { notify } from './notifications';

const KEY = 'mei_outbox';

const fill = (s, vars) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (vars?.[k] !== undefined ? vars[k] : m));

export const getOutbox = () => read(KEY, []);

/**
 * Send a templated message to a customer (owner + optionally team), a partner or any address.
 * `to` = { userId } | { email, phone, name, lang }.
 */
export function sendTemplate(templateKey, to, vars = {}, { level = 'info', link = null, inApp = true } = {}) {
  const p = getPlatform();
  const tpl = p.templates[templateKey];
  if (!tpl) return null;
  const u = to.userId ? getUserById(to.userId) : null;
  const lang = to.lang || u?.lang || 'en';
  const text = { en: fill(tpl.en, vars), ar: fill(tpl.ar, vars) };
  const channels = [];
  if (p.channels.email) channels.push('Email');
  if (p.channels.whatsapp && (to.phone || u?.phone) && (u?.whatsappOptIn !== false)) channels.push('WhatsApp');
  const rec = {
    id: `MSG-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`,
    at: new Date().toISOString(), template: templateKey, templateName: tpl.name,
    to: { name: to.name || u?.fullName || '', email: to.email || u?.email || '', phone: to.phone || u?.phone || '' },
    channels, lang, text,
    from: { email: 'noreply@modelfc.ae', whatsapp: 'Model E-Invoice (WhatsApp Business)' },
  };
  write(KEY, [rec, ...getOutbox()].slice(0, 500));
  if (inApp && p.channels.inApp && to.userId) notify(to.userId, { level, key: tpl.en, vars, link, dedupe: vars?.dedupe });
  return rec;
}

/** Free-text message (OTP codes, invitations, marketing). */
export function sendRaw({ to, subject, text, channel = 'Email' }) {
  const rec = { id: `MSG-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`, at: new Date().toISOString(), template: subject, templateName: subject, to, channels: [channel], lang: 'en', text: { en: text, ar: text }, from: { email: 'noreply@modelfc.ae' } };
  write(KEY, [rec, ...getOutbox()].slice(0, 500));
  return rec;
}

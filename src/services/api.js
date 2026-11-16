// Mock API layer. Every function returns a Promise so it can be swapped for real
// fetch() calls to your backend (e.g. ASP.NET / Node) without touching the pages.
// Data is kept in localStorage for demo purposes only — never store real passwords client-side.

import { getPackage } from '../data/packages';

export const USERS_KEY = 'mei_users';
export const SESSION_KEY = 'mei_session';
const MESSAGES_KEY = 'mei_messages';
const REQUESTS_KEY = 'mei_requirements';

/** Error with an English template + values, so the UI can translate it (see i18n/errText). */
export const fail = (key, vars) => {
  const err = new Error(key.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m)));
  err.key = key;
  err.vars = vars;
  return err;
};

export const delay = (ms = 600) => new Promise((r) => setTimeout(r, ms));

export const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
export const DB_EVENT = 'mei-db-change';
export const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
  // Let open screens refresh (same tab). Other tabs get the native 'storage' event.
  try { window.dispatchEvent(new CustomEvent(DB_EVENT, { detail: { key } })); } catch { /* ignore */ }
};

export const publicUser = ({ password, ...u }) => ({ ...u, teamUsers: (u.teamUsers || []).map(({ password: _p, ...m }) => m) }); // eslint-disable-line no-unused-vars

// ---------- Auth ----------
/**
 * Register the account owner (REG-02/REG-03/REG-04). The company is saved with the account; nothing is
 * submitted to Model until a package is paid (REG-05), so the stage starts at "Awaiting payment".
 */
export async function register({ fullName, email, phone, password, company = null, acceptances = [], referral = null, inviteToken = null, method = 'Password' }) {
  await delay();
  const users = read(USERS_KEY, []);
  const exists = users.some((u) => u.email.toLowerCase() === email.toLowerCase());
  if (exists) throw fail('An account with this email already exists.');
  const lic = company?.tradeLicense?.trim().toLowerCase();
  if (lic && users.some((u) => u.company?.tradeLicense?.trim().toLowerCase() === lic)) throw fail('A company with this trade licence is already registered.');
  const user = {
    id: crypto.randomUUID(),
    fullName,
    email,
    phone,
    password, // DEMO ONLY — the real backend must hash passwords.
    role: 'Owner',
    signInMethod: method,
    emailVerified: true,
    createdAt: new Date().toISOString(),
    stage: 'Awaiting payment',
    stageHistory: [{ from: null, to: 'Awaiting payment', at: new Date().toISOString(), by: fullName, note: 'Account created' }],
    company: company ? { ...company, createdAt: new Date().toISOString() } : null,
    acceptances: acceptances.map((a) => ({ ...a, actorId: 'owner', actorName: fullName })),
    referral,
    inviteToken,
    subscription: null,
    teamUsers: [],
  };
  users.push(user);
  write(USERS_KEY, users);
  const session = { token: `demo-${user.id}`, user: publicUser(user) };
  write(SESSION_KEY, session);
  return session;
}

// ---------- One-time codes (email / WhatsApp) ----------
const OTP_KEY = 'mei_otp';
/** Sends a 6-digit code. Demo: the code is returned so the screen can show it; a real backend never does. */
export function sendOtp({ to, channel = 'Email', purpose = 'login', payload = null }) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const id = `otp-${Date.now().toString(36)}`;
  const all = read(OTP_KEY, {});
  all[id] = { code, to, channel, purpose, payload, expires: Date.now() + 10 * 60000, tries: 0 };
  try { sessionStorage.setItem(OTP_KEY, JSON.stringify(all)); } catch { /* ignore */ }
  try {
    const box = JSON.parse(localStorage.getItem('mei_outbox') || '[]');
    box.unshift({ id: `MSG-${id}`, at: new Date().toISOString(), template: 'Verification code', templateName: 'Verification code', to: { email: to, phone: to }, channels: [channel], lang: 'en', text: { en: `Your Model E-Invoice code is ${code}. It expires in 10 minutes.`, ar: `رمز التحقق من موديل للفوترة الإلكترونية هو ${code}. ينتهي خلال 10 دقائق.` } });
    localStorage.setItem('mei_outbox', JSON.stringify(box.slice(0, 500)));
  } catch { /* ignore */ }
  return { challengeId: id, channel, to, demoCode: code };
}
const readOtps = () => { try { return JSON.parse(sessionStorage.getItem(OTP_KEY) || '{}'); } catch { return {}; } };
/** Checks a code. Returns the challenge payload on success. */
export function verifyOtp(challengeId, code) {
  const all = readOtps();
  const c = all[challengeId];
  if (!c || c.expires < Date.now()) throw fail('The code has expired. Ask for a new one.');
  if (c.tries >= 5) throw fail('Too many attempts. Ask for a new code.');
  if (String(code).trim() !== c.code) {
    all[challengeId] = { ...c, tries: c.tries + 1 };
    try { sessionStorage.setItem(OTP_KEY, JSON.stringify(all)); } catch { /* ignore */ }
    throw fail('The code is not correct.');
  }
  delete all[challengeId];
  try { sessionStorage.setItem(OTP_KEY, JSON.stringify(all)); } catch { /* ignore */ }
  return c.payload || true;
}

const mask = (email) => email.replace(/^(.).*(@.*)$/, '$1•••$2');

/** If two-factor is on, return a challenge instead of a session (NFR-06: mandatory for staff and partners). */
function withSecondFactor(session, { required, to, channel = 'Email' }) {
  if (!required) { write(SESSION_KEY, session); return session; }
  const c = sendOtp({ to, channel, purpose: 'login', payload: session });
  return { otpRequired: true, challengeId: c.challengeId, channel, to: mask(to), demoCode: c.demoCode };
}

/** Second step of sign-in. */
export async function completeLogin(challengeId, code) {
  await delay(300);
  const session = verifyOtp(challengeId, code);
  write(SESSION_KEY, session);
  return session;
}

export async function login({ email, password, remember }) {
  await delay();
  const em = String(email || '').trim().toLowerCase();
  // 1) Model staff (ADM-01): roles from the staff list; two-factor always.
  const { getStaff } = await import('./staff');
  const st = getStaff().find((s) => s.email.toLowerCase() === em);
  if (st) {
    if (st.password !== password) throw fail('Invalid email or password.');
    if (st.status !== 'Active') throw fail('Your user is deactivated. Ask your company owner to activate it.');
    const session = { token: `staff-${st.id}`, staff: true, remember, user: { id: st.id, fullName: st.name, email: st.email, role: st.roles.includes('Manager') ? 'SuperAdmin' : 'Staff', staffRoles: st.roles } };
    return withSecondFactor(session, { required: true, to: st.email });
  }
  // 2) Partner users (PRT-07): two-factor always.
  const { getPartners } = await import('./partners');
  const partner = getPartners().find((p) => p.users.some((u) => u.email === em));
  if (partner) {
    const pu = partner.users.find((u) => u.email === em);
    if (pu.password !== password) throw fail('Invalid email or password.');
    if (pu.status !== 'Active') throw fail('Your user is deactivated. Ask your company owner to activate it.');
    if (['Applied', 'Under review', 'Rejected'].includes(partner.status)) throw fail('Your partner application is still being reviewed. We will email you when it is approved.');
    if (partner.status === 'Suspended') throw fail('This partner account is suspended. Contact Model.');
    const session = { token: `partner-${pu.id}`, remember, partnerId: partner.id, partnerUser: { id: pu.id, name: pu.name, email: pu.email, role: pu.role }, user: { id: partner.id, fullName: pu.name, email: pu.email, role: 'Partner' } };
    return withSecondFactor(session, { required: true, to: pu.email });
  }
  // 3) Customers. Two-factor is available and optional (NFR-06).
  const users = read(USERS_KEY, []);
  const user = users.find((u) => u.email.toLowerCase() === em);
  if (!user) {
    // Team member of a company: signs in to the owner's company with their own role.
    const owner = users.find((u) => (u.teamUsers || []).some((m) => m.email?.toLowerCase() === em));
    const m = owner?.teamUsers.find((x) => x.email.toLowerCase() === em);
    if (!m || (m.password || 'Demo@2026') !== password) throw fail('Invalid email or password.');
    if (m.status !== 'Active') throw fail('Your user is deactivated. Ask your company owner to activate it.');
    if (owner.disabled) throw fail('This company is deactivated. Contact support.');
    const role = m.role === 'User' ? 'Accountant' : m.role;
    const session = { token: `demo-${owner.id}-${m.id}`, user: publicUser(owner), member: { id: m.id, name: m.name, email: m.email, role }, remember };
    return withSecondFactor(session, { required: !!m.twoFA, to: m.email });
  }
  if (user.password !== password) throw fail('Invalid email or password.');
  const session = { token: `demo-${user.id}`, user: publicUser(user), remember };
  return withSecondFactor(session, { required: !!user.twoFA && user.role !== 'SuperAdmin', to: user.email });
}

export async function forgotPassword(email) {
  await delay();
  return { key: 'If {email} is registered, a reset link has been sent.', vars: { email } };
}

export function getSession() {
  return read(SESSION_KEY, null);
}

export function logout() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export const getUsers = () => read(USERS_KEY, []);
export const getUserById = (id) => getUsers().find((u) => u.id === id) || null;

/** Patch one user. `patch` can be an object or a function (user) => partial. */
export function updateUser(userId, patch) {
  const users = read(USERS_KEY, []);
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) throw fail('User not found.');
  const p = typeof patch === 'function' ? patch(users[idx]) : patch;
  users[idx] = { ...users[idx], ...p };
  write(USERS_KEY, users);
  const updated = publicUser(users[idx]);
  // Only refresh the stored session when it belongs to this user (admins edit other accounts).
  const session = read(SESSION_KEY, null);
  if (session?.user?.id === userId) write(SESSION_KEY, { ...session, user: updated });
  return updated;
}

/** Replace the whole users list (bulk updates from the queue engine / admin). */
export const saveUsers = (users) => write(USERS_KEY, users);

// ---------- Plan changes ----------
/** Prorated price to upgrade now: (new − old monthly price) × months × remaining share of the period. */
export function upgradeQuote(subscription, toPackageId) {
  const from = getPackage(subscription.packageId);
  const to = getPackage(toPackageId);
  const start = new Date(subscription.startDate).getTime();
  const end = new Date(subscription.endDate).getTime();
  const remaining = Math.max(0, Math.min(1, (end - Date.now()) / (end - start)));
  const amount = Math.max(0, Math.round((to.price - from.price) * subscription.months * remaining));
  return { amount, remainingDays: Math.ceil((end - Date.now()) / 86400000), remainingShare: remaining };
}

export async function scheduleDowngrade(userId, toPackageId) {
  await delay(500);
  const users = read(USERS_KEY, []);
  const user = users.find((u) => u.id === userId);
  const to = getPackage(toPackageId);
  const activeUsers = 1 + (user.teamUsers || []).filter((m) => m.status === 'Active').length;
  if (activeUsers > to.users) {
    throw fail(
      '{name} allows {max} users and you have {active} active. Deactivate {extra} user(s) first.',
      { name: to.name, max: to.users, active: activeUsers, extra: activeUsers - to.users }
    );
  }
  const subscription = {
    ...user.subscription,
    pendingChange: { packageId: to.id, packageName: to.name, effectiveDate: user.subscription.endDate },
  };
  return updateUser(userId, { subscription });
}

export async function cancelPendingChange(userId) {
  await delay(300);
  const users = read(USERS_KEY, []);
  const user = users.find((u) => u.id === userId);
  return updateUser(userId, { subscription: { ...user.subscription, pendingChange: null } });
}

// ---------- Demo statistics ----------
function seeded(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildDemoActivity(seed, targetSent) {
  const rnd = seeded(seed);
  const days = [];
  const weights = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    const weekend = d.getDay() === 0 || d.getDay() === 6; // Sat/Sun lighter
    return (weekend ? 0.35 : 1) * (0.6 + rnd() * 0.8);
  });
  const wSum = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 14; i++) {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    const sent = Math.round((weights[i] / wSum) * targetSent);
    const failed = Math.round(sent * (0.01 + rnd() * 0.04));
    days.push({ date: d.toISOString().slice(0, 10), sent, failed });
  }
  const sent = days.reduce((a, d) => a + d.sent, 0);
  const failed = days.reduce((a, d) => a + d.failed, 0);
  const customers = ['Al Noor LLC', 'Gulf Star Trading', 'Emirates Foods', 'Blue Wave Marine', 'Desert Rose Interiors', 'Falcon Logistics', 'Oasis Medical Center', 'Palm Tech Solutions'];
  const statuses = ['Success', 'Success', 'Processing', 'Success', 'Queued', 'Success', 'Failed', 'Success'];
  const recent = Array.from({ length: 8 }, (_, i) => ({
    id: `INV-${1240 - i}`,
    customer: customers[Math.floor(rnd() * customers.length)],
    amount: Math.round(500 + rnd() * 12000),
    status: statuses[i],
    time: new Date(Date.now() - i * 37 * 60000).toISOString(),
  }));
  return {
    days,
    recent,
    totals: { sent, failed, processing: 8, queued: 15 },
  };
}

// ---------- Company & users ----------
export async function saveCompany(userId, company) {
  await delay();
  return updateUser(userId, { company: { ...company, createdAt: new Date().toISOString() } });
}

export async function addTeamUser(userId, member) {
  await delay(400);
  const users = read(USERS_KEY, []);
  const owner = users.find((u) => u.id === userId);
  const limit = owner.subscription?.usersLimit ?? 0;
  const current = 1 + (owner.teamUsers || []).filter((m) => m.status === 'Active').length;
  if (current >= limit) {
    throw fail('Your package allows up to {limit} users. Upgrade your package to add more.', { limit });
  }
  const email = String(member.email || '').trim().toLowerCase();
  if (users.some((u) => u.email.toLowerCase() === email || (u.teamUsers || []).some((m) => m.email?.toLowerCase() === email))) {
    throw fail('A user with this email already exists.');
  }
  // Demo: a temporary password the owner passes on. A real backend emails an invitation link.
  const tempPassword = `Mei-${Math.random().toString(36).slice(2, 7)}${Math.floor(10 + Math.random() * 89)}`;
  const teamUsers = [...(owner.teamUsers || []), { id: crypto.randomUUID(), ...member, email, password: tempPassword, status: 'Active' }];
  const updated = updateUser(userId, { teamUsers });
  return { ...updated, _tempPassword: tempPassword };
}

// ---------- Contact & requirements ----------
export async function sendContactMessage(payload) {
  await delay();
  const list = read(MESSAGES_KEY, []);
  const ticket = `MSG-${String(list.length + 1001)}`;
  list.push({ ...payload, ticket, createdAt: new Date().toISOString() });
  write(MESSAGES_KEY, list);
  // Sales and Enterprise enquiries become CRM leads with their source (CRM-02).
  if (/Sales|Enterprise/.test(payload.topic || '')) {
    try {
      const { createLead } = await import('./crm');
      createLead({ name: payload.name, company: payload.company, email: payload.email, phone: payload.phone, source: /Enterprise/.test(payload.topic) ? 'Enterprise' : 'Website form', note: payload.message });
    } catch { /* ignore */ }
  }
  // Also lands in the system admin's support inbox.
  try {
    const { createTicket } = await import('./support');
    const tk = createTicket({ name: payload.name || payload.fullName || '', email: payload.email || '', company: payload.company || '', subject: payload.subject || payload.topic || 'Website enquiry', category: ({ 'Technical support': 'Technical', 'API & integration': 'Integration / API', 'Billing & refunds': 'Billing', 'Onboarding / EmaraTax linking': 'Account' })[payload.topic] || 'Sales enquiry', message: payload.message || '-', source: 'Contact form' });
    return { ticket: tk.id };
  } catch { return { ticket }; }
}

export async function submitRequirement(payload) {
  await delay();
  const list = read(REQUESTS_KEY, []);
  const ref = `REQ-${String(list.length + 2001)}`;
  list.push({ ...payload, ref, status: 'Submitted', createdAt: new Date().toISOString() });
  write(REQUESTS_KEY, list);
  try {
    const { createLead } = await import('./crm');
    createLead({ name: payload.contactName, company: payload.companyName, email: payload.email, phone: payload.phone, source: 'Website form', package: payload.recommended, note: `Requirements form ${ref}` });
  } catch { /* ignore */ }
  return { ref };
}

// ---------- Dummy data helpers ----------
/** Sample activity for any user (deterministic per user, so it doesn't jump between visits). */
export function getDemoActivity(seed, targetSent = 210) {
  return buildDemoActivity(String(seed), targetSent);
}

/** Older accounts that bought a package before demo data existed get it filled in once. */
export function ensureActivity(userId) {
  const users = read(USERS_KEY, []);
  const user = users.find((u) => u.id === userId);
  if (!user || !user.subscription || user.activity) return null;
  const activity = buildDemoActivity(user.id, Math.round(user.subscription.transactionsLimit * 0.42));
  return updateUser(userId, { activity, subscription: { ...user.subscription, transactionsUsed: activity.totals.sent } });
}

export const DEMO_EMAIL = 'demo@modelfc.ae';
export const DEMO_PASSWORD = 'Demo@2026';

/** Creates a fully filled demo account (company, team, payments, statistics) if it doesn't exist yet. */
export function seedDemoAccount() {
  const users = read(USERS_KEY, []);
  if (users.some((u) => u.email === DEMO_EMAIL)) return;
  const pkg = getPackage('pro');
  const start = new Date(); start.setDate(start.getDate() - 12);
  const end = new Date(start); end.setMonth(end.getMonth() + 1);
  const lastMonth = new Date(start); lastMonth.setMonth(lastMonth.getMonth() - 1);
  const id = 'demo-user-0001';
  const activity = buildDemoActivity(id, 300);
  users.push({
    id,
    fullName: 'Hisham Ahmed',
    email: DEMO_EMAIL,
    phone: '+971 50 123 4567',
    password: DEMO_PASSWORD, // demo only
    role: 'Owner',
    createdAt: lastMonth.toISOString(),
    company: { name: 'ABC Trading LLC', tradeLicense: 'CN-1234567', trn: '100234567800003', emirate: 'Dubai', address: 'Office 1204, Bay Square, Business Bay', createdAt: lastMonth.toISOString() },
    subscription: {
      packageId: pkg.id, packageName: pkg.name, months: 1,
      transactionsLimit: pkg.transactions + 100, transactionsUsed: activity.totals.sent, addonTransactions: 100,
      usersLimit: pkg.users, startDate: start.toISOString(), endDate: end.toISOString(),
      status: 'Active', paymentId: 'pi_demo00002', total: 105, pendingChange: null,
    },
    activity,
    teamUsers: [
      { id: 'tm-1', name: 'Sara Al Mansoori', email: 'sara@abctrading.ae', role: 'Accountant', status: 'Active' },
      { id: 'tm-2', name: 'Omar Haddad', email: 'omar@abctrading.ae', role: 'Admin', status: 'Active' },
      { id: 'tm-3', name: 'Priya Nair', email: 'priya@abctrading.ae', role: 'Viewer', status: 'Active' },
    ],
    payments: [
      { id: 'pi_demo00001', date: lastMonth.toISOString(), description: { key: '{name} package · {months} month(s)', vars: { name: 'Pro', months: 1 } }, total: 105, status: 'Paid' },
      { id: 'pi_demo00002', date: start.toISOString(), description: { key: '{name} package · {months} month(s)', vars: { name: 'Pro', months: 1 } }, total: 105, status: 'Paid' },
      { id: 'pi_demo00003', date: new Date(Date.now() - 3 * 86400000).toISOString(), description: { key: 'Add-on · +{n} transactions', vars: { n: 100 } }, total: 94.5, status: 'Paid' },
    ],
  });
  write(USERS_KEY, users);
}

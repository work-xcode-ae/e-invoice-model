// Mock API layer. Every function returns a Promise so it can be swapped for real
// fetch() calls to your backend (e.g. ASP.NET / Node) without touching the pages.
// Data is kept in localStorage for demo purposes only — never store real passwords client-side.

import { getPackage, periodPrice, VAT_RATE } from '../data/packages';

const USERS_KEY = 'mei_users';
const SESSION_KEY = 'mei_session';
const MESSAGES_KEY = 'mei_messages';
const REQUESTS_KEY = 'mei_requirements';

const delay = (ms = 600) => new Promise((r) => setTimeout(r, ms));

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
};

const publicUser = ({ password, ...u }) => u;

// ---------- Auth ----------
export async function register({ fullName, email, phone, password }) {
  await delay();
  const users = read(USERS_KEY, []);
  const exists = users.some((u) => u.email.toLowerCase() === email.toLowerCase());
  if (exists) throw new Error('An account with this email already exists.');
  const user = {
    id: crypto.randomUUID(),
    fullName,
    email,
    phone,
    password, // DEMO ONLY — the real backend must hash passwords.
    role: 'Owner',
    createdAt: new Date().toISOString(),
    company: null,
    subscription: null,
    teamUsers: [],
  };
  users.push(user);
  write(USERS_KEY, users);
  const session = { token: `demo-${user.id}`, user: publicUser(user) };
  write(SESSION_KEY, session);
  return session;
}

export async function login({ email, password, remember }) {
  await delay();
  const users = read(USERS_KEY, []);
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || user.password !== password) throw new Error('Invalid email or password.');
  const session = { token: `demo-${user.id}`, user: publicUser(user), remember };
  write(SESSION_KEY, session);
  return session;
}

export async function forgotPassword(email) {
  await delay();
  return { message: `If ${email} is registered, a reset link has been sent.` };
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

function updateUser(userId, patch) {
  const users = read(USERS_KEY, []);
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) throw new Error('User not found.');
  users[idx] = { ...users[idx], ...patch };
  write(USERS_KEY, users);
  const session = read(SESSION_KEY, null);
  const updated = publicUser(users[idx]);
  if (session) write(SESSION_KEY, { ...session, user: updated });
  return updated;
}

// ---------- Subscription / checkout ----------
export function quote(cartItem) {
  if (!cartItem) return null;
  let subtotal = 0;
  if (cartItem.type === 'package') {
    subtotal = periodPrice(getPackage(cartItem.packageId), cartItem.months);
  } else if (cartItem.type === 'addon' || cartItem.type === 'upgrade') {
    subtotal = cartItem.price;
  }
  const vat = +(subtotal * VAT_RATE).toFixed(2);
  return { subtotal, vat, total: +(subtotal + vat).toFixed(2) };
}

const recordPayment = (user, item, q, paymentId) => [
  ...(user.payments || []),
  {
    id: paymentId,
    date: new Date().toISOString(),
    description:
      item.type === 'package' ? `${getPackage(item.packageId).name} package · ${item.months} month(s)`
      : item.type === 'addon' ? `Add-on · +${item.transactions} transactions`
      : `Upgrade to ${getPackage(item.packageId).name}`,
    total: q.total,
    status: 'Paid',
  },
];

export async function checkout(userId, cartItem) {
  await delay(1200); // simulate Stripe payment
  const users = read(USERS_KEY, []);
  const user = users.find((u) => u.id === userId);
  const q = quote(cartItem);
  const paymentId = `pi_${Math.random().toString(36).slice(2, 12)}`;
  const payments = recordPayment(user, cartItem, q, paymentId);
  const current = user.subscription;

  if (cartItem.type === 'package') {
    const pkg = getPackage(cartItem.packageId);
    // Renewal of the same active package: extend the period and add a new allowance.
    if (current && current.status === 'Active' && current.packageId === pkg.id) {
      const end = new Date(current.endDate);
      end.setMonth(end.getMonth() + cartItem.months);
      const subscription = {
        ...current,
        months: current.months + cartItem.months,
        endDate: end.toISOString(),
        transactionsLimit: current.transactionsLimit + pkg.transactions * cartItem.months,
        pendingChange: null,
      };
      return { user: updateUser(userId, { subscription, payments }), paymentId, renewed: true, ...q };
    }
    const start = new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + cartItem.months);
    const subscription = {
      packageId: pkg.id,
      packageName: pkg.name,
      months: cartItem.months,
      transactionsLimit: pkg.transactions * cartItem.months,
      transactionsUsed: 0,
      addonTransactions: 0,
      usersLimit: pkg.users,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      status: 'Active',
      paymentId,
      total: q.total,
      pendingChange: null,
    };
    // Demo activity so the dashboard statistics have something to show.
    const activity = buildDemoActivity(user.id, Math.round(subscription.transactionsLimit * 0.42));
    subscription.transactionsUsed = activity.totals.sent;
    return { user: updateUser(userId, { subscription, payments, activity }), paymentId, ...q };
  }

  if (cartItem.type === 'addon') {
    if (!current) throw new Error('You need an active package before buying add-ons.');
    const subscription = {
      ...current,
      transactionsLimit: current.transactionsLimit + cartItem.transactions,
      addonTransactions: (current.addonTransactions || 0) + cartItem.transactions,
    };
    return { user: updateUser(userId, { subscription, payments }), paymentId, ...q };
  }

  if (cartItem.type === 'upgrade') {
    if (!current) throw new Error('You need an active package before upgrading.');
    const pkg = getPackage(cartItem.packageId);
    const subscription = {
      ...current,
      packageId: pkg.id,
      packageName: pkg.name,
      usersLimit: pkg.users,
      transactionsLimit: pkg.transactions * current.months + (current.addonTransactions || 0),
      pendingChange: null,
    };
    return { user: updateUser(userId, { subscription, payments }), paymentId, upgraded: true, ...q };
  }
  throw new Error('Unknown cart item.');
}

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
    throw new Error(
      `${to.name} allows ${to.users} users and you have ${activeUsers} active. Deactivate ${activeUsers - to.users} user(s) first.`
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
  const customers = ['Al Noor LLC', 'Gulf Star Trading', 'Emirates Foods', 'Blue Wave Marine', 'Desert Rose Interiors', 'Falcon Logistics'];
  const statuses = ['Success', 'Success', 'Success', 'Processing', 'Queued', 'Success', 'Failed'];
  const recent = Array.from({ length: 6 }, (_, i) => ({
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
  const current = 1 + (owner.teamUsers?.length || 0);
  if (current >= limit) {
    throw new Error(`Your package allows up to ${limit} users. Upgrade your package to add more.`);
  }
  const teamUsers = [...(owner.teamUsers || []), { id: crypto.randomUUID(), ...member, status: 'Active' }];
  return updateUser(userId, { teamUsers });
}

// ---------- Contact & requirements ----------
export async function sendContactMessage(payload) {
  await delay();
  const list = read(MESSAGES_KEY, []);
  const ticket = `MSG-${String(list.length + 1001)}`;
  list.push({ ...payload, ticket, createdAt: new Date().toISOString() });
  write(MESSAGES_KEY, list);
  return { ticket };
}

export async function submitRequirement(payload) {
  await delay();
  const list = read(REQUESTS_KEY, []);
  const ref = `REQ-${String(list.length + 2001)}`;
  list.push({ ...payload, ref, status: 'Submitted', createdAt: new Date().toISOString() });
  write(REQUESTS_KEY, list);
  return { ref };
}

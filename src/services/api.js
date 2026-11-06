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
  } else if (cartItem.type === 'addon') {
    subtotal = cartItem.price;
  }
  const vat = +(subtotal * VAT_RATE).toFixed(2);
  return { subtotal, vat, total: +(subtotal + vat).toFixed(2) };
}

export async function checkout(userId, cartItem) {
  await delay(1200); // simulate Stripe payment
  const users = read(USERS_KEY, []);
  const user = users.find((u) => u.id === userId);
  const q = quote(cartItem);
  const paymentId = `pi_${Math.random().toString(36).slice(2, 12)}`;

  if (cartItem.type === 'package') {
    const pkg = getPackage(cartItem.packageId);
    const start = new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + cartItem.months);
    const subscription = {
      packageId: pkg.id,
      packageName: pkg.name,
      months: cartItem.months,
      transactionsLimit: pkg.transactions * cartItem.months,
      transactionsUsed: 0,
      usersLimit: pkg.users,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      status: 'Active',
      paymentId,
      total: q.total,
    };
    return { user: updateUser(userId, { subscription }), paymentId, ...q };
  }

  if (cartItem.type === 'addon') {
    if (!user.subscription) throw new Error('You need an active package before buying add-ons.');
    const subscription = {
      ...user.subscription,
      transactionsLimit: user.subscription.transactionsLimit + cartItem.transactions,
    };
    return { user: updateUser(userId, { subscription }), paymentId, ...q };
  }
  throw new Error('Unknown cart item.');
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

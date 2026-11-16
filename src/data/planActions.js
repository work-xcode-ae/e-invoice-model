import { getPackage } from './packages';
import { upgradeCart } from '../services/billing';

const ENDED = ['Cancelled', 'Ended', 'Refunded (Locked)'];

/**
 * What a logged-in customer can do with a given package:
 *  - 'buy'       no live subscription
 *  - 'current'   the package they are on (renewal is automatic)
 *  - 'upgrade'   more expensive → applies now, prorated (BIL-07)
 *  - 'downgrade' cheaper → scheduled for the next billing period
 */
export function planAction(subscription, pkg) {
  if (!subscription || ENDED.includes(subscription.status)) return 'buy';
  if (subscription.packageId === pkg.id) return 'current';
  const cur = getPackage(subscription.packageId);
  return Number(pkg.price) > Number(cur?.price || 0) ? 'upgrade' : 'downgrade';
}

export const actionLabel = (action, pkg, t = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => v?.[k] ?? m)) => {
  const name = t(pkg.name);
  return {
    buy: t('Get {name}', { name }),
    current: t('Your current plan'),
    renew: t('Renew current plan'),
    upgrade: t('Upgrade to {name}', { name }),
    downgrade: t('Switch to {name}', { name }),
  }[action];
};

/** Builds the cart item (or a redirect) for a package choice. */
export function choosePackage({ user, pkg, months, setCart, navigate }) {
  const action = planAction(user?.subscription, pkg);
  if (action === 'upgrade') {
    if (!user.subscription.ledger) { navigate('/dashboard?tab=plan'); return; }
    setCart(upgradeCart(user, pkg.id));
    navigate('/cart');
  } else if (action === 'downgrade') {
    navigate('/dashboard?tab=plan', { state: { downgradeTo: pkg.id } });
  } else if (action === 'current') {
    navigate('/dashboard?tab=plan');
  } else {
    setCart({ type: 'package', packageId: pkg.id, months });
    navigate('/cart');
  }
}

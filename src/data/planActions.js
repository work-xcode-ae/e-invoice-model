import { getPackage } from './packages';
import { upgradeQuote } from '../services/api';

/**
 * What a logged-in customer can do with a given package:
 *  - 'buy'       no active subscription
 *  - 'renew'     same package → extend the period
 *  - 'upgrade'   more expensive → applies now, prorated
 *  - 'downgrade' cheaper → scheduled for the next billing period
 */
export function planAction(subscription, pkg) {
  if (!subscription || subscription.status !== 'Active') return 'buy';
  if (subscription.packageId === pkg.id) return 'renew';
  return pkg.price > getPackage(subscription.packageId).price ? 'upgrade' : 'downgrade';
}

export const actionLabel = (action, pkg) =>
  ({ buy: `Get ${pkg.name}`, renew: 'Renew current plan', upgrade: `Upgrade to ${pkg.name}`, downgrade: `Switch to ${pkg.name}` }[action]);

/** Builds the cart item (or a redirect) for a package choice. */
export function choosePackage({ user, pkg, months, setCart, navigate }) {
  const action = planAction(user?.subscription, pkg);
  if (action === 'upgrade') {
    const q = upgradeQuote(user.subscription, pkg.id);
    setCart({ type: 'upgrade', packageId: pkg.id, price: q.amount, remainingDays: q.remainingDays });
    navigate('/cart');
  } else if (action === 'downgrade') {
    navigate('/dashboard?tab=plan', { state: { downgradeTo: pkg.id } });
  } else {
    const m = action === 'renew' ? months : months;
    setCart({ type: 'package', packageId: pkg.id, months: m });
    navigate('/cart');
  }
}

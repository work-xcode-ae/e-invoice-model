import { upcomingPeriods } from '../services/tax';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Trash2, Loader2, CheckCircle2, Lock, PackagePlus, FileText, AlertCircle, ArrowUpCircle } from 'lucide-react';
import PageHero from '../components/PageHero';
import { useAuth } from '../context/AuthContext';
import { getPackage, billingPeriods, periodPrice, formatMoney } from '../data/packages';
import { quote, checkout } from '../services/api';
import { useLang, errText } from '../i18n/LanguageContext';

const fmtDate = (d, locale = 'en-GB') => new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });

export default function Cart() {
  const { t, locale } = useLang();
  const { cart, setCart, user, isAuthenticated, refreshUser, can } = useAuth();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);

  if (receipt) {
    const s = receipt.user.subscription;
    return (
      <section className="section">
        <div className="container">
          <div className="card success-hero" style={{ maxWidth: 560, padding: 36 }}>
            <div className="big-check"><CheckCircle2 size={38} /></div>
            <h1 style={{ fontSize: 28 }}>{t('Payment successful!')}</h1>
            <p className="muted">{t('Your subscription is now active. Payment ref:')} <code dir="ltr">{receipt.paymentId}</code></p>
            <div className="table-wrap" style={{ textAlign: 'left' }}>
              <table>
                <tbody>
                  <tr><td>{t('Package')}</td><td><strong>{t(s.packageName)}</strong></td></tr>
                  <tr><td>{t('Transactions')}</td><td>{s.transactionsLimit.toLocaleString()}</td></tr>
                  <tr><td>{t('Users')}</td><td>{s.usersLimit}</td></tr>
                  <tr><td>{t('Start date')}</td><td>{fmtDate(s.startDate, locale)}</td></tr>
                  <tr><td>{t('End date')}</td><td>{fmtDate(s.endDate, locale)}</td></tr>
                  <tr><td>{t('Amount paid')}</td><td>{formatMoney(receipt.total)} {t('(incl. VAT)')}</td></tr>
                </tbody>
              </table>
            </div>
            <button className="btn btn-primary btn-lg mt-3" onClick={() => navigate('/dashboard')}>{t('Go to Dashboard')}</button>
          </div>
        </div>
      </section>
    );
  }

  if (isAuthenticated && !can('billing')) {
    return (
      <section className="section">
        <div className="container">
          <div className="card center" style={{ maxWidth: 520, margin: '0 auto', padding: 36 }}>
            <h2>{t('Only the account owner can pay')}</h2>
            <p className="muted">{t('Ask the owner of your company account to renew, upgrade or buy add-ons.')}</p>
            <button className="btn btn-primary" onClick={() => { setCart(null); navigate('/dashboard'); }}>{t('Go to Dashboard')}</button>
          </div>
        </div>
      </section>
    );
  }

  if (!cart) {
    return (
      <>
        <PageHero title={t('Your Cart')} crumb={t('Cart')} />
        <section className="section">
          <div className="container center">
            <ShoppingCart size={48} color="#94a3b8" style={{ margin: '0 auto 16px' }} />
            <h2>{t('Your cart is empty')}</h2>
            <p className="muted">{t('Choose a package to get started.')}</p>
            <Link to="/packages" className="btn btn-primary">{t('Browse packages')}</Link>
          </div>
        </section>
      </>
    );
  }

  const pkg = cart.type === 'package' ? getPackage(cart.packageId) : null;
  const upTo = cart.type === 'upgrade' ? getPackage(cart.packageId) : null;
  const isRenewal = pkg && user?.subscription?.status === 'Active' && user.subscription.packageId === pkg.id;
  const q = quote(cart);

  const pay = async () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: '/cart' } });
      return;
    }
    setPaying(true);
    setError('');
    try {
      const res = await checkout(user.id, cart);
      refreshUser(res.user);
      setCart(null);
      if (cart.type === 'addon') navigate('/dashboard', { state: { flash: { key: '{n} transactions added to your package.', vars: { n: cart.transactions } } } });
      else if (cart.type === 'upgrade') navigate('/dashboard?tab=plan', { state: { flash: { key: "You're now on the {name} plan. New limits apply immediately.", vars: { name: res.user.subscription.packageName } } } });
      else if (res.renewed) navigate('/dashboard?tab=plan', { state: { flash: { key: 'Renewed. Your plan now runs until {date}.', vars: { date: res.user.subscription.endDate }, dateVar: 'date' } } });
      else setReceipt(res);
    } catch (e) {
      setError(e);
    } finally {
      setPaying(false);
    }
  };

  return (
    <>
      <PageHero title={t('Your Cart')} crumb={t('Cart')} subtitle={t('Review your order and pay securely with Stripe.')} />
      <section className="section">
        <div className="container checkout-grid">
          <div className="card">
            <div className="flex between items-center mb-2">
              <h3 className="mb-0">{t('Cart (1)')}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setCart(null)}><Trash2 size={15} /> {t('Remove')}</button>
            </div>

            <div className="flex gap-2 items-center" style={{ padding: '16px 0', borderTop: '1px solid var(--line)' }}>
              <div className="icon-box purple mb-0">{upTo ? <ArrowUpCircle size={22} /> : pkg ? <FileText size={22} /> : <PackagePlus size={22} />}</div>
              <div style={{ flex: 1 }}>
                {upTo ? (
                  <>
                    <h4 className="mb-0">{t('Upgrade:')} {t(user?.subscription?.packageName)} <span className="flip-rtl" style={{ display: 'inline-block' }}>→</span> {t(upTo.name)}</h4>
                    <p className="muted mb-0" style={{ fontSize: 14 }}>
                      {t('Prorated for the {days} days left · {tx} invoices/mo · {users} users · applies immediately', { days: cart.remainingDays, tx: upTo.transactions.toLocaleString(), users: upTo.users })}
                    </p>
                  </>
                ) : pkg ? (
                  <>
                    <h4 className="mb-0">{isRenewal ? t('Renew {name}', { name: t(pkg.name) }) : t('{name} Package', { name: t(pkg.name) })}</h4>
                    <p className="muted mb-0" style={{ fontSize: 14 }}>
                      {t('{tx} transactions · {users} users', { tx: (pkg.transactions * cart.months).toLocaleString(), users: pkg.users })} · {t(pkg.support)}
                    </p>
                  </>
                ) : (
                  <>
                    <h4 className="mb-0">{t('Add-on: +{n} transactions', { n: cart.transactions })}</h4>
                    <p className="muted mb-0" style={{ fontSize: 14 }}>{t('Valid until your current package end date')}</p>
                  </>
                )}
              </div>
              <strong>{formatMoney(q.subtotal)}</strong>
            </div>

            {pkg && (
              <>
                <h4 className="mt-2">{t('Subscription period')}</h4>
                <div className="grid" style={{ gap: 10 }}>
                  {billingPeriods.map((b) => (
                    <label key={b.months} className={`option-row ${cart.months === b.months ? 'on' : ''}`}>
                      <span className="flex items-center gap-1">
                        <input type="radio" name="period" checked={cart.months === b.months} onChange={() => setCart({ ...cart, months: b.months })} />
                        {t(b.label)} {b.save && <span className="badge green">{t('Save')} {b.save}</span>}
                      </span>
                      <strong>{formatMoney(periodPrice(pkg, b.months))}</strong>
                    </label>
                  ))}
                </div>
                <p className="mt-2 mb-0"><Link to="/packages">{t('Change package')}</Link></p>
              </>
            )}
          </div>

          <aside className="card">
            <h3>{t('Order summary')}</h3>
            <div className="summary-row"><span>{t('Subtotal')}</span><span>{formatMoney(q.subtotal)}</span></div>
            <div className="summary-row"><span>{t(q.included ? 'Includes VAT ({rate}%)' : 'VAT ({rate}%)', { rate: q.rate })}</span><span>{formatMoney(q.vat)}</span></div>
            <div className="summary-row total"><span>{t('Total')}</span><span>{formatMoney(q.total)}</span></div>
            {upcomingPeriods().slice(0, 1).map((p) => (
              <p key={p.id} className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('From {date}, VAT changes to {rate}%.', { date: fmtDate(p.from, locale), rate: p.registered ? p.billingRate : 0 })}</p>
            ))}

            {error && <div className="alert error mt-2"><AlertCircle size={18} /> {errText(t, error)}</div>}
            {!isAuthenticated && (
              <div className="alert info mt-2"><Lock size={18} /> {t('Please log in or create an account to complete payment.')}</div>
            )}

            <button className="btn btn-block btn-lg stripe-btn mt-2" onClick={pay} disabled={paying}>
              {paying ? <><Loader2 size={18} className="spin" /> {t('Processing payment…')}</>
                : isAuthenticated ? <>{t('Pay with')} <strong style={{ fontSize: 18, letterSpacing: '-0.02em' }} dir="ltr">stripe</strong></>
                : t('Login to continue')}
            </button>
            <div className="pay-icons"><Lock size={13} /> {t('Secure payment · Visa · Mastercard · Apple Pay · Google Pay')}</div>
            <p className="muted mt-2 mb-0" style={{ fontSize: 12 }}>
              {t('Demo mode: no real card is charged. Connect Stripe Checkout in the backend for live payments.')}
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}

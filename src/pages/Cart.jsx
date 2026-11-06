import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Trash2, Loader2, CheckCircle2, Lock, PackagePlus, FileText, AlertCircle } from 'lucide-react';
import PageHero from '../components/PageHero';
import { useAuth } from '../context/AuthContext';
import { getPackage, billingPeriods, periodPrice, formatMoney } from '../data/packages';
import { quote, checkout } from '../services/api';

const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export default function Cart() {
  const { cart, setCart, user, isAuthenticated, refreshUser } = useAuth();
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
            <h1 style={{ fontSize: 28 }}>Payment successful!</h1>
            <p className="muted">Your subscription is now active. Payment ref: <code>{receipt.paymentId}</code></p>
            <div className="table-wrap" style={{ textAlign: 'left' }}>
              <table>
                <tbody>
                  <tr><td>Package</td><td><strong>{s.packageName}</strong></td></tr>
                  <tr><td>Transactions</td><td>{s.transactionsLimit.toLocaleString()}</td></tr>
                  <tr><td>Users</td><td>{s.usersLimit}</td></tr>
                  <tr><td>Start date</td><td>{fmtDate(s.startDate)}</td></tr>
                  <tr><td>End date</td><td>{fmtDate(s.endDate)}</td></tr>
                  <tr><td>Amount paid</td><td>{formatMoney(receipt.total)} (incl. VAT)</td></tr>
                </tbody>
              </table>
            </div>
            <button className="btn btn-primary btn-lg mt-3" onClick={() => navigate('/dashboard')}>Go to Dashboard</button>
          </div>
        </div>
      </section>
    );
  }

  if (!cart) {
    return (
      <>
        <PageHero title="Your Cart" crumb="Cart" />
        <section className="section">
          <div className="container center">
            <ShoppingCart size={48} color="#94a3b8" style={{ margin: '0 auto 16px' }} />
            <h2>Your cart is empty</h2>
            <p className="muted">Choose a package to get started.</p>
            <Link to="/packages" className="btn btn-primary">Browse packages</Link>
          </div>
        </section>
      </>
    );
  }

  const pkg = cart.type === 'package' ? getPackage(cart.packageId) : null;
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
      if (cart.type === 'addon') navigate('/dashboard', { state: { flash: `${cart.transactions} transactions added to your package.` } });
      else setReceipt(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <>
      <PageHero title="Your Cart" crumb="Cart" subtitle="Review your order and pay securely with Stripe." />
      <section className="section">
        <div className="container checkout-grid">
          <div className="card">
            <div className="flex between items-center mb-2">
              <h3 className="mb-0">Cart (1)</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setCart(null)}><Trash2 size={15} /> Remove</button>
            </div>

            <div className="flex gap-2 items-center" style={{ padding: '16px 0', borderTop: '1px solid var(--line)' }}>
              <div className="icon-box purple mb-0">{pkg ? <FileText size={22} /> : <PackagePlus size={22} />}</div>
              <div style={{ flex: 1 }}>
                {pkg ? (
                  <>
                    <h4 className="mb-0">{pkg.name} Package</h4>
                    <p className="muted mb-0" style={{ fontSize: 14 }}>
                      {(pkg.transactions * cart.months).toLocaleString()} transactions · {pkg.users} users · {pkg.support}
                    </p>
                  </>
                ) : (
                  <>
                    <h4 className="mb-0">Add-on: +{cart.transactions} transactions</h4>
                    <p className="muted mb-0" style={{ fontSize: 14 }}>Valid until your current package end date</p>
                  </>
                )}
              </div>
              <strong>{formatMoney(q.subtotal)}</strong>
            </div>

            {pkg && (
              <>
                <h4 className="mt-2">Subscription period</h4>
                <div className="grid" style={{ gap: 10 }}>
                  {billingPeriods.map((b) => (
                    <label key={b.months} className={`option-row ${cart.months === b.months ? 'on' : ''}`}>
                      <span className="flex items-center gap-1">
                        <input type="radio" name="period" checked={cart.months === b.months} onChange={() => setCart({ ...cart, months: b.months })} />
                        {b.label} {b.save && <span className="badge green">Save {b.save}</span>}
                      </span>
                      <strong>{formatMoney(periodPrice(pkg, b.months))}</strong>
                    </label>
                  ))}
                </div>
                <p className="mt-2 mb-0"><Link to="/packages">Change package</Link></p>
              </>
            )}
          </div>

          <aside className="card">
            <h3>Order summary</h3>
            <div className="summary-row"><span>Subtotal</span><span>{formatMoney(q.subtotal)}</span></div>
            <div className="summary-row"><span>VAT (5%)</span><span>{formatMoney(q.vat)}</span></div>
            <div className="summary-row total"><span>Total</span><span>{formatMoney(q.total)}</span></div>

            {error && <div className="alert error mt-2"><AlertCircle size={18} /> {error}</div>}
            {!isAuthenticated && (
              <div className="alert info mt-2"><Lock size={18} /> Please log in or create an account to complete payment.</div>
            )}

            <button className="btn btn-block btn-lg stripe-btn mt-2" onClick={pay} disabled={paying}>
              {paying ? <><Loader2 size={18} className="spin" /> Processing payment…</>
                : isAuthenticated ? <>Pay with <strong style={{ fontSize: 18, letterSpacing: '-0.02em' }}>stripe</strong></>
                : 'Login to continue'}
            </button>
            <div className="pay-icons"><Lock size={13} /> Secure payment · Visa · Mastercard · Apple Pay · Google Pay</div>
            <p className="muted mt-2 mb-0" style={{ fontSize: 12 }}>
              Demo mode: no real card is charged. Connect Stripe Checkout in the backend for live payments.
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}

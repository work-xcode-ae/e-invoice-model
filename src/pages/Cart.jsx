import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Trash2, Loader2, CheckCircle2, Lock, FileText, AlertCircle, ArrowUpCircle, CreditCard, Landmark, Tag, Info } from 'lucide-react';
import PageHero from '../components/PageHero';
import { useAuth } from '../context/AuthContext';
import { getPackage, billingPeriods, periodPrice, formatMoney, annualSaving } from '../data/packages';
import { quoteCart, checkout, bankTransferAllowed, tokenizeCard } from '../services/billing';
import { upcomingPeriods } from '../services/tax';
import { getPlatform } from '../services/platform';
import { useLang, errText } from '../i18n/LanguageContext';
import { fmtDate } from '../utils/format';

const lineText = (t, l) => (typeof l.desc === 'string' ? t(l.desc) : t(l.desc.key, { ...(l.desc.vars || {}), name: t(l.desc.vars?.name), period: t(l.desc.vars?.period), type: t(l.desc.vars?.type) }));

export default function Cart() {
  const { t, locale } = useLang();
  const { cart, setCart, user, isAuthenticated, refreshUser, can } = useAuth();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [method, setMethod] = useState('Card');
  const [useSaved, setUseSaved] = useState(true);
  const [card, setCard] = useState({ number: '', exp: '', name: '', save: true });
  const [promo, setPromo] = useState(cart?.promo || '');
  const [bankRef, setBankRef] = useState('');

  if (receipt) {
    const pending = receipt.pending;
    return (
      <section className="section">
        <div className="container">
          <div className="card success-hero" style={{ maxWidth: 620, padding: 36 }}>
            <div className="big-check">{pending ? <Landmark size={34} /> : <CheckCircle2 size={38} />}</div>
            <h1 style={{ fontSize: 28 }}>{t(pending ? 'Order received' : 'Payment successful!')}</h1>
            {pending ? (
              <>
                <p className="muted">{t('Your order {id} is waiting for the bank transfer. Nothing is submitted until our manager confirms the payment.', { id: receipt.order.id })}</p>
                <BankDetails total={receipt.order.quote.total} reference={receipt.order.id} />
              </>
            ) : (
              <>
                <p className="muted">{t('Tax invoice {no} was emailed to you. Your application is submitted.', { no: receipt.invoice.id })}</p>
                <div className="alert info" style={{ textAlign: 'start' }}><Info size={18} /> {receipt.type === 'New' ? t('Next: upload your documents. Your subscription year starts on the activation date, not today.') : t('Your plan is updated.')}</div>
              </>
            )}
            <button className="btn btn-primary btn-lg mt-3" onClick={() => navigate(pending ? '/dashboard?tab=plan' : receipt.type === 'New' ? '/dashboard?tab=journey' : '/dashboard?tab=plan')}>{t(pending ? 'Go to Dashboard' : receipt.type === 'New' ? 'Upload documents' : 'Go to Dashboard')}</button>
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
            <h2>{t('Only a manager can pay')}</h2>
            <p className="muted">{t('Ask a manager of your company account to choose, upgrade or renew the package.')}</p>
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
  let q = null; let promoError = '';
  try { q = quoteCart(cart, user); } catch (e) { promoError = e; q = quoteCart({ ...cart, promo: '' }, user); }
  const bankOk = bankTransferAllowed(cart);
  const saved = user?.card;

  const applyPromo = () => setCart({ ...cart, promo: promo.trim().toUpperCase() });

  const pay = async () => {
    if (!isAuthenticated) { navigate('/login', { state: { from: '/cart' } }); return; }
    setPaying(true); setError('');
    try {
      let c = null;
      if (method === 'Card' && !(useSaved && saved)) c = tokenizeCard(card);
      const res = await checkout(user.id, promoError ? { ...cart, promo: '' } : cart, { method: method === 'Bank' ? 'Bank transfer' : 'Card', card: c, saveCardToo: card.save, bankRef });
      if (res.user) refreshUser(res.user);
      setCart(null);
      setReceipt(res);
    } catch (e) {
      setError(e);
    } finally {
      setPaying(false);
    }
  };

  return (
    <>
      <PageHero title={t('Your Cart')} crumb={t('Cart')} subtitle={t('Review your order and pay securely. No fee for card payments.')} />
      <section className="section">
        <div className="container checkout-grid">
          <div className="card">
            <div className="flex between items-center mb-2">
              <h3 className="mb-0">{t('Cart (1)')}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setCart(null)}><Trash2 size={15} /> {t('Remove')}</button>
            </div>

            <div className="flex gap-2 items-center" style={{ padding: '16px 0', borderTop: '1px solid var(--line)' }}>
              <div className="icon-box purple mb-0">{upTo ? <ArrowUpCircle size={22} /> : <FileText size={22} />}</div>
              <div style={{ flex: 1 }}>
                {upTo ? (
                  <>
                    <h4 className="mb-0">{t('Upgrade:')} {t(user?.subscription?.packageName)} <span className="flip-rtl" style={{ display: 'inline-block' }}>→</span> {t(upTo.name)}</h4>
                    <p className="muted mb-0" style={{ fontSize: 14 }}>{t('Prorated for the {days} days left · new monthly documents are added at once · separate invoice', { days: cart.remainingDays })}</p>
                  </>
                ) : (
                  <>
                    <h4 className="mb-0">{t('{name} Package', { name: t(pkg.name) })}</h4>
                    <p className="muted mb-0" style={{ fontSize: 14 }}>{t('{tx} documents a month · {users} users · {price} per extra document', { tx: Number(pkg.transactions).toLocaleString(), users: pkg.users, price: formatMoney(pkg.overagePrice) })}</p>
                  </>
                )}
              </div>
            </div>

            {pkg && (
              <>
                <h4 className="mt-2">{t('Billing')}</h4>
                <div className="grid" style={{ gap: 10 }}>
                  {billingPeriods.map((b) => (
                    <label key={b.months} className={`option-row ${cart.months === b.months ? 'on' : ''}`}>
                      <span className="flex items-center gap-1">
                        <input type="radio" name="period" checked={cart.months === b.months} onChange={() => setCart({ ...cart, months: b.months })} />
                        {t(b.label)} {b.months === 12 && annualSaving(pkg) > 0 && <span className="badge green">{t('Save')} {annualSaving(pkg)}%</span>}
                      </span>
                      <strong>{formatMoney(periodPrice(pkg, b.months))}</strong>
                    </label>
                  ))}
                </div>
                <p className="muted mt-1 mb-0" style={{ fontSize: 13 }}>{t('Your subscription year starts on the activation date. The first month is prorated from that date.')}</p>
              </>
            )}

            <h4 className="mt-3">{t('Order lines')}</h4>
            <div className="table-wrap">
              <table>
                <tbody>
                  {q.lines.map((l, i) => <tr key={i} className={l.amount < 0 ? 'text-success' : ''}><td>{lineText(t, l)}</td><td className="center" dir="ltr" style={{ textAlign: 'end' }}><b>{formatMoney(l.amount)}</b></td></tr>)}
                </tbody>
              </table>
            </div>

            {pkg && (
              <div className="field mt-2">
                <label>{t('Offer code')}</label>
                <div className="input-with-btn" style={{ display: 'flex', gap: 8 }}>
                  <div className="input-wrap" style={{ flex: 1 }}><Tag size={16} /><input className="input" dir="ltr" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="LAUNCH20" /></div>
                  <button type="button" className="btn btn-outline" onClick={applyPromo}>{t('Apply')}</button>
                </div>
                {promoError ? <span className="err">{errText(t, promoError)}</span> : q.discount?.source === 'special' ? <span className="hint">{t('Your special discount applies. Only one discount per invoice.')}</span> : cart.promo ? <span className="hint">{t('Code {code} applied.', { code: cart.promo })}</span> : null}
              </div>
            )}

            <h4 className="mt-3">{t('Payment method')}</h4>
            <div className="grid" style={{ gap: 10 }}>
              <label className={`option-row ${method === 'Card' ? 'on' : ''}`}><span className="flex items-center gap-1"><input type="radio" checked={method === 'Card'} onChange={() => setMethod('Card')} /> <CreditCard size={16} /> {t('Card · no extra fee')}</span></label>
              <label className={`option-row ${method === 'Bank' ? 'on' : ''} ${bankOk ? '' : 'row-muted'}`}><span className="flex items-center gap-1"><input type="radio" disabled={!bankOk} checked={method === 'Bank'} onChange={() => setMethod('Bank')} /> <Landmark size={16} /> {t('Bank transfer')}</span><small className="muted">{t(bankOk ? 'Confirmed by our manager' : 'Annual and Enterprise only')}</small></label>
            </div>

            {method === 'Card' && (
              <div className="mt-2">
                {saved && (
                  <label className="checkbox mb-1"><input type="checkbox" checked={useSaved} onChange={(e) => setUseSaved(e.target.checked)} /> {t('Use saved card {brand} •••• {last4}', { brand: saved.brand, last4: saved.last4 })}</label>
                )}
                {!(useSaved && saved) && (
                  <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
                    <div className="field"><label>{t('Card number')}</label><input className="input" dir="ltr" inputMode="numeric" placeholder="4242 4242 4242 4242" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} /></div>
                    <div className="field"><label>{t('Expiry')}</label><input className="input" dir="ltr" placeholder="MM/YY" value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} /></div>
                    <div className="field full"><label>{t('Name on card')}</label><input className="input" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} /></div>
                    <label className="checkbox full"><input type="checkbox" checked={card.save} onChange={(e) => setCard({ ...card, save: e.target.checked })} /> {t('Save this card for automatic renewal')}</label>
                    <p className="muted full mb-0" style={{ fontSize: 12 }}>{t('Demo: any future expiry works. A number ending in 0002 is declined.')}</p>
                  </div>
                )}
              </div>
            )}
            {method === 'Bank' && (
              <div className="mt-2">
                <BankDetails total={q.total} />
                <div className="field mt-2"><label>{t('Your transfer reference (optional)')}</label><input className="input" dir="ltr" value={bankRef} onChange={(e) => setBankRef(e.target.value)} /></div>
              </div>
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
            {!isAuthenticated && <div className="alert info mt-2"><Lock size={18} /> {t('Please log in or create an account to complete payment.')}</div>}

            <button className="btn btn-block btn-lg btn-primary mt-2" onClick={pay} disabled={paying}>
              {paying ? <><Loader2 size={18} className="spin" /> {t('Processing payment…')}</>
                : !isAuthenticated ? t('Login to continue')
                : method === 'Bank' ? t('Place order') : t('Pay {amount}', { amount: formatMoney(q.total) })}
            </button>
            <div className="pay-icons"><Lock size={13} /> {t('Card details are handled by the payment gateway and never stored on the platform.')}</div>
            <p className="muted mt-2 mb-0" style={{ fontSize: 12 }}>{t('Your application is submitted only after the payment succeeds. A tax invoice is emailed at once.')}</p>
          </aside>
        </div>
      </section>
    </>
  );
}

export function BankDetails({ total, reference }) {
  const { t } = useLang();
  const b = getPlatform().bank;
  return (
    <div className="kv-grid">
      <div><span>{t('Bank')}</span><b>{b.bankName}</b></div>
      <div><span>{t('Account name')}</span><b>{b.accountName}</b></div>
      <div><span>IBAN</span><b dir="ltr">{b.iban}</b></div>
      <div><span>SWIFT</span><b dir="ltr">{b.swift}</b></div>
      {total !== undefined && <div><span>{t('Amount')}</span><b dir="ltr">{formatMoney(total)}</b></div>}
      {reference && <div><span>{t('Reference')}</span><b dir="ltr">{reference}</b></div>}
    </div>
  );
}

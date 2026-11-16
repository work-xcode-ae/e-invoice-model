import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Check, Minus, Info, Layers, Gift, CalendarClock, TrendingUp } from 'lucide-react';
import PageHero from '../components/PageHero';
import PackageCard, { PeriodToggle } from '../components/PackageCard';
import { packages, activePackages, formatMoney, VAT_RATE, PRICES_INCLUDE_VAT } from '../data/packages';
import { useAuth } from '../context/AuthContext';
import { choosePackage, planAction, actionLabel } from '../data/planActions';
import { useLang } from '../i18n/LanguageContext';
import { useSeo, usePage } from '../components/Brd';
import { getPlatform } from '../services/platform';

const Cell = ({ v, t }) =>
  v === true ? <Check size={18} className="yes" style={{ margin: '0 auto' }} />
    : v === false || v === 0 ? <Minus size={18} className="no" style={{ margin: '0 auto' }} />
    : <span>{typeof v === 'string' ? t(v) : v}</span>;

const vatNote = () => ({ rate: +(VAT_RATE * 100).toFixed(2), included: PRICES_INCLUDE_VAT });

export default function Packages() {
  const [months, setMonths] = useState(1);
  const navigate = useNavigate();
  const { setCart, user } = useAuth();
  const { t } = useLang();
  useSeo('packages');
  const page = usePage('packages');
  const du = getPlatform().durations;
  const list = activePackages();

  const choose = (pkg) => {
    if (pkg.custom) { navigate('/contact?enterprise=1'); return; }
    choosePackage({ user, pkg, months, setCart, navigate });
  };

  const rows = [
    ['Monthly price', ...list.map((p) => (p.custom ? 'Custom' : formatMoney(p.price)))],
    ['Annual price', ...list.map((p) => (p.custom ? 'Custom' : formatMoney(p.annualPrice)))],
    ['Documents / month', ...list.map((p) => (p.custom ? 'Custom' : Number(p.transactions).toLocaleString()))],
    ['Free documents / year', ...list.map(() => String(du.freeDocs))],
    ['Price per extra document', ...list.map((p) => (p.custom ? 'Custom' : formatMoney(p.overagePrice)))],
    ['Setup fee', ...list.map((p) => (Number(p.setupFee) ? `${formatMoney(p.setupFee)} · ${t(p.setupFeeType === 'annual' ? 'yearly' : 'once')}` : false))],
    ['Users', ...list.map((p) => String(p.users))],
    ['Entities', ...list.map((p) => String(p.entities))],
    ...['Billing portal (web)', 'Excel upload', 'ERP API', 'SFTP'].map((m) => [m, ...list.map((p) => (p.linkMethods || []).includes(m))]),
    ['Consulting hours / year', ...list.map((p) => (p.consultingHours ? String(p.consultingHours) : false))],
    ['Consulting discount', ...list.map((p) => (p.consultingDiscount ? `${p.consultingDiscount}%` : false))],
    ['Support', ...list.map((p) => p.support)],
    ['Payment', ...list.map((p) => (p.custom ? 'Bank transfer' : 'Card · bank transfer for annual'))],
  ];

  return (
    <>
      <PageHero
        title={page.title || t('Packages & Pricing')}
        subtitle={page.subtitle || t(vatNote().included ? 'Prices in AED, including {rate}% VAT. Monthly or annual, upgrade anytime.' : vatNote().rate ? 'Prices in AED, excluding {rate}% VAT. Monthly or annual, upgrade anytime.' : 'Prices in AED. Monthly or annual, upgrade anytime.', { rate: vatNote().rate })}
        overlap
        center
      >
        <div className="mt-3"><PeriodToggle months={months} onChange={setMonths} dark /></div>
      </PageHero>

      <section className="pricing-overlap">
        <div className="container">
          <div className="pgrid pgrid-5">
            {list.map((p) => (
              <PackageCard key={p.id} pkg={p} months={months} onSelect={choose}
                label={actionLabel(planAction(user?.subscription, p), p, t)} current={user?.subscription?.packageId === p.id} />
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">
          <div className="grid grid-4 mt-2">
            {[
              [Gift, 'Free documents first', '{n} free documents in every subscription year are used before anything else.', { n: du.freeDocs }],
              [Layers, 'Carry-over', 'Unused monthly documents carry over until the end of your subscription year.'],
              [TrendingUp, 'Never blocked', 'Sending continues past your allowance. Extra documents appear on your next monthly invoice.'],
              [CalendarClock, 'Starts on activation', 'Your subscription year starts when your account is activated, not when you pay.'],
            ].map(([Icon, title, d, v]) => (
              <div className="card" key={title}>
                <div className="icon-box"><Icon size={20} /></div>
                <h3 style={{ fontSize: 17 }}>{t(title)}</h3>
                <p className="mb-0">{t(d, v)}</p>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <div className="section-head" style={{ marginBottom: 28 }}>
              <div className="eyebrow">{t('Compare')}</div>
              <h2>{t('Full comparison')}</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('Feature')}</th>
                    {list.map((p) => <th key={p.id} className="center">{t(p.name)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([label, ...vals]) => (
                    <tr key={label}>
                      <td>{t(label)}</td>
                      {vals.map((v, i) => <td key={i} className="center"><Cell v={v} t={t} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-2 mt-4">
            <div className="card">
              <h3>{t('Package rules')}</h3>
              <ul className="req-list mt-2">
                <li><Check size={16} /> {t('Only sent documents count. An invoice or a credit note is one document. Received documents are free.')}</li>
                <li><Check size={16} /> {t('Order of use: free yearly documents, then this month’s documents, then your carried-over balance, then extra documents.')}</li>
                <li><Check size={16} /> {t('We alert you at 80% and 100% of your documents. Sending never stops.')}</li>
                <li><Check size={16} /> {t('One monthly invoice: subscription, last month’s extra documents and the yearly setup fee when it is due.')}</li>
                <li><Check size={16} /> {t('Upgrades apply immediately with a prorated difference. Downgrades apply from the next cycle with no refund.')}</li>
                <li><Check size={16} /> {t('The annual price is never more than 12 monthly payments.')}</li>
              </ul>
            </div>
            <div className="card">
              <h3>{t('Payment and refunds')}</h3>
              <ul className="req-list mt-2">
                <li><Check size={16} /> {t('Pay by card with no extra fee. Annual and Enterprise subscriptions can also pay by bank transfer.')}</li>
                <li><Check size={16} /> {t('Your card is saved securely by the payment gateway for automatic renewal. You can turn renewal off at any time.')}</li>
                <li><Check size={16} /> {t('If a renewal payment fails, you have {n} days to pay and sending continues meanwhile.', { n: du.graceDays })}</li>
                <li><Check size={16} /> {t('Full refund within {n} days of payment if linking is not complete and no document was sent.', { n: du.refundDays })} <Link to="/refund-policy">{t('Refund policy')}</Link></li>
              </ul>
              <div className="alert info mt-2"><Info size={18} /> {t('Need several entities or a custom volume?')} <Link to="/contact?enterprise=1">{t('Request an Enterprise quote')}</Link></div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

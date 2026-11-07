import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Minus, PackagePlus, Info } from 'lucide-react';
import PageHero from '../components/PageHero';
import PackageCard, { PeriodToggle } from '../components/PackageCard';
import { packages, activePackages, addOns, formatMoney, VAT_RATE, PRICES_INCLUDE_VAT } from '../data/packages';
import { useAuth } from '../context/AuthContext';
import { choosePackage, planAction, actionLabel } from '../data/planActions';
import { useLang } from '../i18n/LanguageContext';

const matrix = [
  ['Transactions / month', '100', '500', '1,000'],
  ['Users', '2', '5', '10'],
  ['Manual invoice entry', true, true, true],
  ['Excel bulk upload', true, true, true],
  ['Peppol PINT AE delivery', true, true, true],
  ['FTA Tax Data reporting', true, true, true],
  ['Transaction & user audit log', true, true, true],
  ['REST API & SDKs (.NET, Java, Python, PHP)', false, true, true],
  ['CSV export', false, true, true],
  ['ERP connectors', false, false, true],
  ['SFTP batch upload', false, false, 'On request'],
  ['Support', 'Standard', 'Priority', 'Dedicated'],
];

const Cell = ({ v, t }) =>
  v === true ? <Check size={18} className="yes" style={{ margin: '0 auto' }} />
    : v === false ? <Minus size={18} className="no" style={{ margin: '0 auto' }} />
    : <span>{t(v)}</span>;

const vatNote = () => ({ rate: +(VAT_RATE * 100).toFixed(2), included: PRICES_INCLUDE_VAT });

export default function Packages() {
  const [months, setMonths] = useState(1);
  const navigate = useNavigate();
  const { setCart, user } = useAuth();
  const { t } = useLang();

  const choose = (pkg) => choosePackage({ user, pkg, months, setCart, navigate });

  const buyAddon = (a) => {
    setCart({ type: 'addon', addonId: a.id, transactions: a.transactions, price: a.price });
    navigate('/cart');
  };

  return (
    <>
      <PageHero
        title={t('Packages & Pricing')}
        subtitle={t(vatNote().included ? 'Prices in AED, including {rate}% VAT. Renew, top up or upgrade anytime.' : vatNote().rate ? 'Prices in AED, excluding {rate}% VAT. Renew, top up or upgrade anytime.' : 'Prices in AED. Renew, top up or upgrade anytime.', { rate: vatNote().rate })}
        overlap
        center
      >
        <div className="mt-3"><PeriodToggle months={months} onChange={setMonths} dark /></div>
      </PageHero>

      <section className="pricing-overlap">
        <div className="container">
          <div className="pgrid">
            {activePackages().map((p) => (
              <PackageCard key={p.id} pkg={p} months={months} onSelect={choose}
                label={actionLabel(planAction(user?.subscription, p), p, t)} current={user?.subscription?.packageId === p.id} />
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">

          {/* Add-ons */}
          <div className="mt-4" id="addons">
            <div className="section-head" style={{ marginBottom: 28 }}>
              <div className="eyebrow">{t('Add-ons')}</div>
              <h2>{t('Need more transactions this period?')}</h2>
              <p>{t('Add-on transactions are added to your current package and stay valid until its end date.')}</p>
            </div>
            <div className="grid grid-3">
              {addOns.map((a) => (
                <div key={a.id} className="card card-hover flex items-center between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="icon-box green mb-0"><PackagePlus size={20} /></div>
                    <div>
                      <h3 className="mb-0" style={{ fontSize: 17 }}>{t('+{n} transactions', { n: a.transactions })}</h3>
                      <p>{formatMoney(a.price)}</p>
                    </div>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => buyAddon(a)} disabled={!user?.subscription}>
                    {t('Add')}
                  </button>
                </div>
              ))}
            </div>
            {!user?.subscription && (
              <div className="alert info mt-2">
                <Info size={18} /> {t('Add-ons are available after you buy a package. Log in and choose a package first.')}
              </div>
            )}
          </div>

          {/* Comparison */}
          <div className="mt-4">
            <div className="section-head" style={{ marginBottom: 28 }}>
              <div className="eyebrow">{t('Compare')}</div>
              <h2>{t('Full feature comparison')}</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('Feature')}</th>
                    {packages.map((p) => <th key={p.id} className="center">{t(p.name)}<br /><span className="muted" style={{ fontWeight: 500 }}>{formatMoney(p.price)}/{t('mo')}</span></th>)}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map(([label, ...vals]) => (
                    <tr key={label}>
                      <td>{t(label)}</td>
                      {vals.map((v, i) => <td key={i} className="center"><Cell v={v} t={t} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Rules */}
          <div className="grid grid-2 mt-4">
            <div className="card">
              <h3>{t('Package rules')}</h3>
              <ul className="req-list mt-2">
                <li><Check size={16} /> {t('Each sent invoice uses one transaction from your package.')}</li>
                <li><Check size={16} /> {t('When the limit is reached, new invoices pause until you renew, upgrade or buy an add-on.')}</li>
                <li><Check size={16} /> {t('Renewal starts a new period with a fresh transaction allowance.')}</li>
                <li><Check size={16} /> {t('Downgrades apply from the next billing period.')}</li>
                <li><Check size={16} /> {t('Upgrades apply immediately. You only pay the prorated difference for the days left.')}</li>
              </ul>
            </div>
            <div className="card">
              <h3>{t('User limits')}</h3>
              <ul className="req-list mt-2">
                <li><Check size={16} /> {t('Active users cannot exceed your package limit.')}</li>
                <li><Check size={16} /> {t('Before downgrading, the account owner deactivates extra users.')}</li>
                <li><Check size={16} /> {t('Deactivated users keep their history but cannot sign in.')}</li>
                <li><Check size={16} /> {t('The account owner is always counted as one user.')}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Minus, PackagePlus, Info } from 'lucide-react';
import PageHero from '../components/PageHero';
import PackageCard, { PeriodToggle } from '../components/PackageCard';
import { packages, addOns, formatMoney } from '../data/packages';
import { useAuth } from '../context/AuthContext';

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

const Cell = ({ v }) =>
  v === true ? <Check size={18} className="yes" style={{ margin: '0 auto' }} />
    : v === false ? <Minus size={18} className="no" style={{ margin: '0 auto' }} />
    : <span>{v}</span>;

export default function Packages() {
  const [months, setMonths] = useState(1);
  const navigate = useNavigate();
  const { setCart, user } = useAuth();

  const choose = (pkg) => {
    setCart({ type: 'package', packageId: pkg.id, months });
    navigate('/cart');
  };

  const buyAddon = (a) => {
    setCart({ type: 'addon', addonId: a.id, transactions: a.transactions, price: a.price });
    navigate('/cart');
  };

  return (
    <>
      <PageHero
        title="Packages & Pricing"
        subtitle="Prices in AED, excluding 5% VAT. Renew, top up or upgrade anytime."
        overlap
        center
      >
        <div className="mt-3"><PeriodToggle months={months} onChange={setMonths} dark /></div>
      </PageHero>

      <section className="pricing-overlap">
        <div className="container">
          <div className="pgrid">
            {packages.map((p) => (
              <PackageCard key={p.id} pkg={p} months={months} onSelect={choose} />
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">

          {/* Add-ons */}
          <div className="mt-4" id="addons">
            <div className="section-head" style={{ marginBottom: 28 }}>
              <div className="eyebrow">Add-ons</div>
              <h2>Need more transactions this period?</h2>
              <p>Add-on transactions are added to your current package and stay valid until its end date.</p>
            </div>
            <div className="grid grid-3">
              {addOns.map((a) => (
                <div key={a.id} className="card card-hover flex items-center between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="icon-box green mb-0"><PackagePlus size={20} /></div>
                    <div>
                      <h3 className="mb-0" style={{ fontSize: 17 }}>+{a.transactions} transactions</h3>
                      <p>{formatMoney(a.price)}</p>
                    </div>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => buyAddon(a)} disabled={!user?.subscription}>
                    Add
                  </button>
                </div>
              ))}
            </div>
            {!user?.subscription && (
              <div className="alert info mt-2">
                <Info size={18} /> Add-ons are available after you buy a package. Log in and choose a package first.
              </div>
            )}
          </div>

          {/* Comparison */}
          <div className="mt-4">
            <div className="section-head" style={{ marginBottom: 28 }}>
              <div className="eyebrow">Compare</div>
              <h2>Full feature comparison</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Feature</th>
                    {packages.map((p) => <th key={p.id} className="center">{p.name}<br /><span className="muted" style={{ fontWeight: 500 }}>AED {p.price}/mo</span></th>)}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map(([label, ...vals]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      {vals.map((v, i) => <td key={i} className="center"><Cell v={v} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Rules */}
          <div className="grid grid-2 mt-4">
            <div className="card">
              <h3>Package rules</h3>
              <ul className="req-list mt-2">
                <li><Check size={16} /> Each sent invoice uses one transaction from your package.</li>
                <li><Check size={16} /> When the limit is reached, new invoices pause until you renew, upgrade or buy an add-on.</li>
                <li><Check size={16} /> Renewal starts a new period with a fresh transaction allowance.</li>
                <li><Check size={16} /> Upgrades and downgrades apply from the next billing period.</li>
              </ul>
            </div>
            <div className="card">
              <h3>User limits</h3>
              <ul className="req-list mt-2">
                <li><Check size={16} /> Active users cannot exceed your package limit.</li>
                <li><Check size={16} /> Before downgrading, the account owner deactivates extra users.</li>
                <li><Check size={16} /> Deactivated users keep their history but cannot sign in.</li>
                <li><Check size={16} /> The account owner is always counted as one user.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

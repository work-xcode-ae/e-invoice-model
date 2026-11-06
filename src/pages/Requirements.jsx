import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileBadge2, Building2, KeyRound, Mail, Globe2, Laptop, Code2, FileSpreadsheet, CheckCircle2,
  ClipboardList, Loader2, Server, PenLine, Sparkles,
} from 'lucide-react';
import PageHero from '../components/PageHero';
import { submitRequirement } from '../services/api';
import { packages } from '../data/packages';

const documents = [
  { icon: FileBadge2, t: 'Valid trade licence', d: 'Trade licence number and issuing authority of the company.' },
  { icon: KeyRound, t: 'TRN / TIN', d: 'Your Tax Registration Number. Your Peppol ID is based on your TIN.' },
  { icon: Building2, t: 'EmaraTax account', d: 'Access to the taxable person in EmaraTax to link Model E-Invoice as your provider.' },
  { icon: Mail, t: 'Registered email', d: 'The taxable person’s email as registered with the FTA. A mobile number is optional.' },
];

const technical = [
  { icon: Laptop, t: 'Web portal', d: 'Any modern browser (Chrome, Edge, Safari, Firefox). MFA app for secure sign-in.' },
  { icon: FileSpreadsheet, t: 'Excel upload', d: '.xlsx files based on our downloadable template.' },
  { icon: Code2, t: 'REST API', d: 'HTTPS with TLS 1.2+, OAuth2 token + API key. UBL XML, JSON or CSV payloads.' },
  { icon: Server, t: 'SFTP (on request)', d: 'Batch files in XML, CSV or EDIFACT, one folder per customer.' },
];

const methods = ['Manual entry', 'Excel upload', 'REST API / SDK', 'ERP connector', 'SFTP batch'];
const erps = ['None', 'Microsoft Business Central', 'Xero', 'SAP', 'Oracle', 'Odoo', 'QuickBooks', 'Other'];
const volumes = [
  { v: '100', label: 'Up to 100 / month' },
  { v: '500', label: '101 – 500 / month' },
  { v: '1000', label: '501 – 1,000 / month' },
  { v: '1001', label: 'More than 1,000 / month' },
];

const initial = {
  companyName: '', contactName: '', email: '', phone: '', trn: '', emirate: 'Dubai',
  volume: '500', users: '3', methods: ['Manual entry'], erp: 'None', timeline: 'Within 1 month', notes: '',
};

function recommend(volume, users) {
  const v = Number(volume); const u = Number(users);
  if (v > 1000) return { name: 'Platinum + add-ons or a custom plan', id: 'custom' };
  return packages.find((p) => p.transactions >= v && p.users >= u) || packages[packages.length - 1];
}

export default function Requirements() {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleMethod = (m) =>
    setForm((f) => ({ ...f, methods: f.methods.includes(m) ? f.methods.filter((x) => x !== m) : [...f.methods, m] }));

  const rec = recommend(form.volume, form.users);

  const validate = () => {
    const e = {};
    if (!form.companyName.trim()) e.companyName = 'Company name is required.';
    if (!form.contactName.trim()) e.contactName = 'Contact name is required.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email.';
    if (form.trn && !/^\d{15}$/.test(form.trn)) e.trn = 'TRN must be 15 digits.';
    if (!form.methods.length) e.methods = 'Select at least one method.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    const res = await submitRequirement({ ...form, recommended: rec.name });
    setLoading(false);
    setDone(res.ref);
  };

  return (
    <>
      <PageHero
        title="Requirements"
        subtitle="What you need to get started, and a form to tell us about your business so we can recommend the right setup."
      />

      <section className="section">
        <div className="container">
          <div className="grid grid-2">
            <div className="card">
              <div className="flex items-center gap-1 mb-2"><ClipboardList size={20} color="#1d6fe8" /><h3 className="mb-0">Onboarding documents</h3></div>
              {documents.map(({ icon: Icon, t, d }) => (
                <div className="info-item" key={t}>
                  <div className="icon-box"><Icon size={20} /></div>
                  <div><h4>{t}</h4><p>{d}</p></div>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="flex items-center gap-1 mb-2"><Globe2 size={20} color="#16a34a" /><h3 className="mb-0">Technical requirements</h3></div>
              {technical.map(({ icon: Icon, t, d }) => (
                <div className="info-item" key={t}>
                  <div className="icon-box green"><Icon size={20} /></div>
                  <div><h4>{t}</h4><p>{d}</p></div>
                </div>
              ))}
            </div>
          </div>

          {/* EmaraTax onboarding */}
          <div className="card mt-3">
            <h3>EmaraTax linking: how onboarding works</h3>
            <p className="mb-2">After you create your company, you link it to Model E-Invoice through EmaraTax.</p>
            <div className="steps" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              {[
                ['Sign in to EmaraTax', 'Select the taxable person and open e-invoicing.'],
                ['Choose Model E-Invoice', 'You are redirected to our portal.'],
                ['Enter email & TIN', 'We verify them with the FTA.'],
                ['Confirm & register', 'Accept the declaration. Your Peppol ID is created.'],
                ['Linked', 'The status is sent back to EmaraTax.'],
              ].map(([t, d], i) => (
                <div className="step" key={t} style={{ padding: 16 }}>
                  <span className="step-num">{i + 1}</span>
                  <h4>{t}</h4>
                  <p>{d}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Requirement form */}
          <div className="checkout-grid mt-4" id="submit">
            <div className="card">
              <div className="flex items-center gap-1 mb-2"><PenLine size={20} color="#1d6fe8" /><h3 className="mb-0">Submit your requirements</h3></div>
              {done ? (
                <div className="success-hero" style={{ padding: '24px 0' }}>
                  <div className="big-check"><CheckCircle2 size={36} /></div>
                  <h2>Requirements received</h2>
                  <p className="muted">Reference <strong>{done}</strong>. Our onboarding team will contact you within one business day.</p>
                  <div className="flex gap-1" style={{ justifyContent: 'center' }}>
                    <Link to="/packages" className="btn btn-primary">View packages</Link>
                    <button className="btn btn-outline" onClick={() => { setDone(null); setForm(initial); }}>Submit another</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={onSubmit} noValidate>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="companyName">Company name *</label>
                      <input id="companyName" className={`input ${errors.companyName ? 'invalid' : ''}`} value={form.companyName} onChange={set('companyName')} placeholder="ABC Trading LLC" />
                      {errors.companyName && <span className="err">{errors.companyName}</span>}
                    </div>
                    <div className="field">
                      <label htmlFor="trn">TRN (optional)</label>
                      <input id="trn" className={`input ${errors.trn ? 'invalid' : ''}`} value={form.trn} onChange={set('trn')} placeholder="15-digit TRN" inputMode="numeric" />
                      {errors.trn && <span className="err">{errors.trn}</span>}
                    </div>
                    <div className="field">
                      <label htmlFor="contactName">Contact person *</label>
                      <input id="contactName" className={`input ${errors.contactName ? 'invalid' : ''}`} value={form.contactName} onChange={set('contactName')} />
                      {errors.contactName && <span className="err">{errors.contactName}</span>}
                    </div>
                    <div className="field">
                      <label htmlFor="email">Email *</label>
                      <input id="email" type="email" className={`input ${errors.email ? 'invalid' : ''}`} value={form.email} onChange={set('email')} placeholder="you@company.com" />
                      {errors.email && <span className="err">{errors.email}</span>}
                    </div>
                    <div className="field">
                      <label htmlFor="phone">Mobile</label>
                      <input id="phone" className="input" value={form.phone} onChange={set('phone')} placeholder="+971 5X XXX XXXX" />
                    </div>
                    <div className="field">
                      <label htmlFor="emirate">Emirate</label>
                      <select id="emirate" className="input" value={form.emirate} onChange={set('emirate')}>
                        {['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'].map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="volume">Expected invoices per month</label>
                      <select id="volume" className="input" value={form.volume} onChange={set('volume')}>
                        {volumes.map((v) => <option key={v.v} value={v.v}>{v.label}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="users">Number of users</label>
                      <input id="users" type="number" min="1" max="100" className="input" value={form.users} onChange={set('users')} />
                    </div>
                    <div className="field full">
                      <label>How will you send invoices? *</label>
                      <div className="chip-group">
                        {methods.map((m) => (
                          <button type="button" key={m} className={`chip ${form.methods.includes(m) ? 'on' : ''}`} onClick={() => toggleMethod(m)}>
                            {form.methods.includes(m) && <CheckCircle2 size={14} />} {m}
                          </button>
                        ))}
                      </div>
                      {errors.methods && <span className="err">{errors.methods}</span>}
                    </div>
                    <div className="field">
                      <label htmlFor="erp">ERP / accounting system</label>
                      <select id="erp" className="input" value={form.erp} onChange={set('erp')}>
                        {erps.map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="timeline">Go-live timeline</label>
                      <select id="timeline" className="input" value={form.timeline} onChange={set('timeline')}>
                        {['Immediately', 'Within 1 month', '1 – 3 months', 'Just exploring'].map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </div>
                    <div className="field full">
                      <label htmlFor="notes">Additional requirements</label>
                      <textarea id="notes" className="input" value={form.notes} onChange={set('notes')} placeholder="E.g. multiple branches, Arabic invoices, self-billing, credit notes, custom integration…" />
                    </div>
                  </div>
                  <button className="btn btn-primary btn-lg mt-3" disabled={loading}>
                    {loading ? <><Loader2 size={18} className="spin" /> Submitting…</> : 'Submit requirements'}
                  </button>
                </form>
              )}
            </div>

            <aside className="card" style={{ position: 'sticky', top: 90 }}>
              <div className="flex items-center gap-1 mb-2"><Sparkles size={20} color="#7c3aed" /><h3 className="mb-0">Recommended for you</h3></div>
              <p className="mb-2">Based on about <strong>{volumes.find((v) => v.v === form.volume)?.label.toLowerCase()}</strong> and <strong>{form.users || 0} users</strong>:</p>
              <div className="alert info" style={{ fontSize: 16 }}>
                <CheckCircle2 size={20} />
                <div>
                  <strong>{rec.name}</strong>
                  {rec.price && <div style={{ fontSize: 14 }}>AED {rec.price} / month · {rec.transactions} transactions · {rec.users} users</div>}
                </div>
              </div>
              {form.methods.some((m) => ['REST API / SDK', 'ERP connector', 'SFTP batch'].includes(m)) && (
                <p className="mt-2" style={{ fontSize: 14 }}>
                  You selected an integration method. API access starts with the <strong>Standard</strong> package, and ERP connectors and SFTP with <strong>Platinum</strong>.
                </p>
              )}
              <Link to="/packages" className="btn btn-outline btn-block mt-2">Compare packages</Link>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}

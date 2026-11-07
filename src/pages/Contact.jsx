import { useState } from 'react';
import { Mail, MapPin, Phone, Clock, Headphones, CheckCircle2, Loader2, Send } from 'lucide-react';
import PageHero from '../components/PageHero';
import { sendContactMessage } from '../services/api';
import { useLang } from '../i18n/LanguageContext';

const topics = ['Sales & packages', 'Onboarding / EmaraTax linking', 'Technical support', 'API & integration', 'Billing & refunds', 'Other'];
const empty = { name: '', email: '', phone: '', company: '', topic: topics[0], message: '' };

export default function Contact() {
  const { t } = useLang();
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!form.name.trim()) er.name = 'Please enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) er.email = 'Enter a valid email.';
    if (form.message.trim().length < 10) er.message = 'Please write at least 10 characters.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setLoading(true);
    const res = await sendContactMessage(form);
    setLoading(false);
    setTicket(res.ticket);
    setForm(empty);
  };

  return (
    <>
      <PageHero title={t('Contact Us')} subtitle={t('Questions about packages, onboarding or integration? Our team in Abu Dhabi is here to help.')} />
      <section className="section">
        <div className="container contact-grid">
          <div className="card">
            <h3>{t('Get in touch')}</h3>
            <p className="mb-2">{t('We answer most messages within one business day.')}</p>
            {[
              { icon: Mail, title: 'Email', d: <a href="mailto:info@modelfc.ae" dir="ltr">info@modelfc.ae</a> },
              { icon: Phone, title: 'Phone', d: <span dir="ltr">+971 2 000 0000</span> },
              { icon: MapPin, title: 'Office', d: 'Al Wahda Commercial Tower, 15th Floor, Office 1504, Abu Dhabi, UAE' },
              { icon: Clock, title: 'Working hours', d: 'Monday – Friday, 9:00 AM – 6:00 PM (GST)' },
              { icon: Headphones, title: 'Support', d: 'First-line support for all customers, with 24/7 platform monitoring.' },
            ].map(({ icon: Icon, title, d }) => (
              <div className="info-item" key={title}>
                <div className="icon-box"><Icon size={20} /></div>
                <div><h4>{t(title)}</h4><p>{typeof d === 'string' ? t(d) : d}</p></div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>{t('Send us a message')}</h3>
            {ticket && (
              <div className="alert success mb-2 mt-1">
                <CheckCircle2 size={18} />
                <span>{t('Thank you! Your message was sent. Ticket number:')} <strong dir="ltr">{ticket}</strong></span>
              </div>
            )}
            <form onSubmit={onSubmit} noValidate className="mt-2">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="c-name">{t('Full name *')}</label>
                  <input id="c-name" className={`input ${errors.name ? 'invalid' : ''}`} value={form.name} onChange={set('name')} />
                  {errors.name && <span className="err">{t(errors.name)}</span>}
                </div>
                <div className="field">
                  <label htmlFor="c-email">{t('Email *')}</label>
                  <input id="c-email" dir="ltr" type="email" className={`input ${errors.email ? 'invalid' : ''}`} value={form.email} onChange={set('email')} />
                  {errors.email && <span className="err">{t(errors.email)}</span>}
                </div>
                <div className="field">
                  <label htmlFor="c-phone">{t('Phone')}</label>
                  <input id="c-phone" className="input" value={form.phone} onChange={set('phone')} placeholder="+971" dir="ltr" />
                </div>
                <div className="field">
                  <label htmlFor="c-company">{t('Company')}</label>
                  <input id="c-company" className="input" value={form.company} onChange={set('company')} />
                </div>
                <div className="field full">
                  <label htmlFor="c-topic">{t('Topic')}</label>
                  <select id="c-topic" className="input" value={form.topic} onChange={set('topic')}>
                    {topics.map((tp) => <option key={tp} value={tp}>{t(tp)}</option>)}
                  </select>
                </div>
                <div className="field full">
                  <label htmlFor="c-msg">{t('Message *')}</label>
                  <textarea id="c-msg" className={`input ${errors.message ? 'invalid' : ''}`} value={form.message} onChange={set('message')} />
                  {errors.message && <span className="err">{t(errors.message)}</span>}
                </div>
              </div>
              <button className="btn btn-primary btn-lg mt-3" disabled={loading}>
                {loading ? <><Loader2 size={18} className="spin" /> {t('Sending…')}</> : <><Send size={18} /> {t('Send message')}</>}
              </button>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}

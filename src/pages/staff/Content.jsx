// Website content managed by Model without any deployment (WEB-03..WEB-07, REG-04 policy versions).
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Save, Plus, Trash2, CheckCircle2, Ban, Eye, Power, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang, errText } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { PageTitle } from '../admin/Admin';
import { getPlatform, setPlatform, scheduleChange } from '../../services/platform';
import { getAds, approveAd, rejectAd, stopAd } from '../../services/ads';
import { formatMoney } from '../../data/packages';
import { fmtDate } from '../../utils/format';

const TABS = [['pages', 'Pages and SEO'], ['home', 'Figures and labels'], ['faq', 'FAQ'], ['news', 'News'], ['ticker', 'News ticker'], ['video', 'Video'], ['ads', 'Advertising'], ['policies', 'Terms and policies']];
const PAGE_NAMES = { home: 'Home', howItWorks: 'How it works', packages: 'Packages', partner: 'Become a partner', faq: 'FAQ', news: 'News', contact: 'Contact', check: 'Are you obligated?', requirements: 'Requirements' };

const Saved = ({ on }) => { const { t } = useLang(); return on ? <span className="badge green"><CheckCircle2 size={12} /> {t('Saved — live now')}</span> : null; };

export function AdminContent() {
  const { t } = useLang();
  useDbVersion();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'pages';
  return (
    <>
      <PageTitle title="Website content" sub="Edit texts, images, SEO, news, ads and policies. Changes appear on the site at once, without a release." />
      <div className="subtabs mb-2">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setParams({ tab: k })}>{t(l)}</button>)}</div>
      {tab === 'pages' && <Pages />}
      {tab === 'home' && <HomeFigures />}
      {tab === 'faq' && <ListEditor path="content.faqs" fields={[['qEn', 'Question (English)'], ['qAr', 'Question (Arabic)', 'rtl'], ['aEn', 'Answer (English)', null, true], ['aAr', 'Answer (Arabic)', 'rtl', true]]} blank={{ qEn: '', qAr: '', aEn: '', aAr: '' }} />}
      {tab === 'news' && <ListEditor path="news" fields={[['date', 'Date', 'ltr', false, 'date'], ['published', 'Published', null, false, 'checkbox'], ['titleEn', 'Title (English)'], ['titleAr', 'Title (Arabic)', 'rtl'], ['bodyEn', 'Text (English)', null, true], ['bodyAr', 'Text (Arabic)', 'rtl', true], ['image', 'Image URL', 'ltr']]} blank={{ id: '', date: new Date().toISOString().slice(0, 10), titleEn: '', titleAr: '', bodyEn: '', bodyAr: '', image: '', published: false }} />}
      {tab === 'ticker' && <ListEditor path="ticker" fields={[['textEn', 'Text (English)'], ['textAr', 'Text (Arabic)', 'rtl'], ['link', 'Link', 'ltr'], ['order', 'Order', 'ltr', false, 'number'], ['start', 'Start', 'ltr', false, 'date'], ['end', 'End', 'ltr', false, 'date'], ['visible', 'Visible', null, false, 'checkbox']]} blank={{ id: '', textEn: '', textAr: '', link: '/', order: 9, start: new Date().toISOString().slice(0, 10), end: '', visible: true }} feature="newsTicker" />}
      {tab === 'video' && <Video />}
      {tab === 'ads' && <Ads />}
      {tab === 'policies' && <Policies />}
    </>
  );
}

function Pages() {
  const { t } = useLang();
  const pages = getPlatform().content.pages;
  const [key, setKey] = useState('home');
  const [d, setD] = useState(pages.home);
  const [ok, setOk] = useState(false);
  const pick = (k) => { setKey(k); setD(pages[k]); setOk(false); };
  const set = (k) => (e) => { setOk(false); setD({ ...d, [k]: e.target.value }); };
  const F = (k, l, dir, area) => <div className={`field ${area ? 'full' : ''}`}><label>{t(l)}</label>{area ? <textarea className="input" rows="2" dir={dir} value={d[k] || ''} onChange={set(k)} /> : <input className="input" dir={dir} value={d[k] || ''} onChange={set(k)} />}</div>;
  return (
    <div className="card">
      <div className="chip-group mb-2">{Object.keys(pages).map((k) => <button key={k} className={`chip ${k === key ? 'on' : ''}`} onClick={() => pick(k)}>{t(PAGE_NAMES[k] || k)}</button>)}</div>
      <div className="form-grid">
        {F('titleEn', 'Title (English)')}{F('titleAr', 'Title (Arabic)', 'rtl')}
        {F('subtitleEn', 'Subtitle (English)', null, true)}{F('subtitleAr', 'Subtitle (Arabic)', 'rtl', true)}
        {F('heroImage', 'Hero image URL', 'ltr')}
        <div className="field">{d.heroImage && <img src={d.heroImage} alt="" style={{ maxHeight: 80, borderRadius: 8 }} />}<label className="btn btn-outline btn-sm" style={{ width: 'fit-content' }}>{t('Upload image')}<input type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => setD({ ...d, heroImage: r.result }); r.readAsDataURL(f); }} /></label></div>
        {F('seoTitleEn', 'SEO title (English)')}{F('seoTitleAr', 'SEO title (Arabic)', 'rtl')}
        {F('seoDescEn', 'SEO description (English)', null, true)}{F('seoDescAr', 'SEO description (Arabic)', 'rtl', true)}
      </div>
      <div className="flex gap-1 items-center mt-2"><button className="btn btn-primary" onClick={() => { setPlatform(`content.pages.${key}`, d, { area: 'Website' }); setOk(true); }}><Save size={15} /> {t('Save')}</button><Saved on={ok} /></div>
    </div>
  );
}

function HomeFigures() {
  const { t } = useLang();
  const c = getPlatform().content;
  const [stats, setStats] = useState(c.stats);
  const [lab, setLab] = useState({ en: c.accreditedLabelEn, ar: c.accreditedLabelAr });
  const [ok, setOk] = useState(false);
  const setS = (i, k, v) => { setOk(false); setStats(stats.map((s, j) => (j === i ? { ...s, [k]: v } : s))); };
  return (
    <div className="card">
      <h3>{t('Figures on the home page')}</h3>
      <p className="muted">{t('Shown at their final value from the first paint, never as zero.')}</p>
      <div className="table-wrap"><table><thead><tr><th>{t('Value')}</th><th>{t('Suffix')}</th><th>{t('Label (English)')}</th><th>{t('Label (Arabic)')}</th><th>{t('Note (English)')}</th><th>{t('Note (Arabic)')}</th></tr></thead>
        <tbody>{stats.map((s, i) => <tr key={i}>{['value', 'suffix', 'labelEn', 'labelAr', 'subEn', 'subAr'].map((k) => <td key={k}><input className="input input-sm" dir={k.endsWith('Ar') ? 'rtl' : k === 'value' || k === 'suffix' ? 'ltr' : undefined} value={s[k]} onChange={(e) => setS(i, k, e.target.value)} /></td>)}</tr>)}</tbody></table></div>
      <h3 className="mt-2">{t('“Accredited” label')}</h3>
      <div className="form-grid"><div className="field"><label>{t('English')}</label><input className="input" value={lab.en} onChange={(e) => setLab({ ...lab, en: e.target.value })} /></div><div className="field"><label>{t('Arabic')}</label><input className="input" dir="rtl" value={lab.ar} onChange={(e) => setLab({ ...lab, ar: e.target.value })} /></div></div>
      <div className="flex gap-1 items-center mt-2"><button className="btn btn-primary" onClick={() => { setPlatform('content.stats', stats, { area: 'Website' }); setPlatform('content.accreditedLabelEn', lab.en, { area: 'Website' }); setPlatform('content.accreditedLabelAr', lab.ar, { area: 'Website' }); setOk(true); }}><Save size={15} /> {t('Save')}</button><Saved on={ok} /></div>
    </div>
  );
}

/** Generic editor for a list setting (FAQ, news, ticker). */
function ListEditor({ path, fields, blank, feature }) {
  const { t } = useLang();
  const p = getPlatform();
  const get = (obj, pth) => pth.split('.').reduce((o, k) => o?.[k], obj);
  const [items, setItems] = useState(get(p, path));
  const [ok, setOk] = useState(false);
  const set = (i, k, v) => { setOk(false); setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x))); };
  return (
    <div className="card">
      {feature && <label className="checkbox mb-2"><input type="checkbox" checked={!!p.features[feature]} onChange={(e) => setPlatform(`features.${feature}`, e.target.checked, { area: 'Website' })} /> {t('Show on the website')}</label>}
      {items.map((it, i) => (
        <div key={it.id || i} className="card-soft mb-2">
          <div className="form-grid">
            {fields.map(([k, l, dir, area, type]) => (
              <div key={k} className={`field ${area ? 'full' : ''}`}><label>{t(l)}</label>
                {type === 'checkbox' ? <input type="checkbox" checked={!!it[k]} onChange={(e) => set(i, k, e.target.checked)} />
                  : area ? <textarea className="input" rows="3" dir={dir || undefined} value={it[k] || ''} onChange={(e) => set(i, k, e.target.value)} />
                  : <input className="input" type={type || 'text'} dir={dir || undefined} value={it[k] ?? ''} onChange={(e) => set(i, k, type === 'number' ? Number(e.target.value) : e.target.value)} />}
              </div>
            ))}
          </div>
          <button className="btn btn-outline btn-sm mt-1" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={14} /> {t('Remove')}</button>
        </div>
      ))}
      <div className="flex gap-1 items-center"><button className="btn btn-outline btn-sm" onClick={() => setItems([...items, { ...blank, id: blank.id === '' ? `x${Date.now().toString(36)}` : undefined }])}><Plus size={14} /> {t('Add')}</button><button className="btn btn-primary btn-sm" onClick={() => { setPlatform(path, items, { area: 'Website' }); setOk(true); }}><Save size={14} /> {t('Save')}</button><Saved on={ok} /></div>
    </div>
  );
}

function Video() {
  const { t } = useLang();
  const p = getPlatform();
  const [v, setV] = useState(p.video);
  const [ok, setOk] = useState(false);
  const set = (w, k, val) => { setOk(false); setV({ ...v, [w]: { ...v[w], [k]: val } }); };
  return (
    <div className="card">
      <label className="checkbox mb-2"><input type="checkbox" checked={!!p.features.video} onChange={(e) => setPlatform('features.video', e.target.checked, { area: 'Website' })} /> {t('Show the video on the website')}</label>
      {['short', 'full'].map((w) => (
        <div className="card-soft mb-2" key={w}><b>{t(w === 'short' ? 'Short version' : 'Full version')}</b>
          <div className="form-grid mt-1">{[['titleEn', 'Title (English)'], ['titleAr', 'Title (Arabic)', 'rtl'], ['url', 'Video URL (MP4)', 'ltr'], ['poster', 'Poster image URL', 'ltr']].map(([k, l, dir]) => <div key={k} className="field"><label>{t(l)}</label><input className="input" dir={dir} value={v[w][k] || ''} onChange={(e) => set(w, k, e.target.value)} /></div>)}</div>
        </div>
      ))}
      <p className="muted" style={{ fontSize: 13 }}>{t('The video loads only when the visitor presses play, so it never slows the page.')}</p>
      <div className="flex gap-1 items-center"><button className="btn btn-primary" onClick={() => { setPlatform('video', v, { area: 'Website' }); setOk(true); }}><Save size={15} /> {t('Save')}</button><Saved on={ok} /></div>
    </div>
  );
}

function Ads() {
  const { t, locale } = useLang();
  const p = getPlatform();
  const [note, setNote] = useState({});
  const [pk, setPk] = useState(p.ads.packages);
  const [err, setErr] = useState('');
  const ads = getAds();
  const act = (fn) => { try { setErr(''); fn(); } catch (e) { setErr(e); } };
  return (
    <>
      <div className="card mb-2">
        <div className="flex between items-center wrap gap-1">
          <h3 className="mb-0">{t('Advertisements')}</h3>
          <button className={`btn btn-sm ${p.ads.globalStop ? 'btn-primary' : 'btn-danger'}`} onClick={() => setPlatform('ads.globalStop', !p.ads.globalStop, { area: 'Website' })}><Power size={14} /> {t(p.ads.globalStop ? 'Resume all ads' : 'Stop all ads now')}</button>
        </div>
        {p.ads.globalStop && <div className="alert warn mt-1"><AlertTriangle size={16} /> {t('All ads are stopped.')}</div>}
        {err && <div className="alert error mt-1">{errText(t, err)}</div>}
        <div className="table-wrap mt-2"><table><thead><tr><th>{t('Ad')}</th><th>{t('Advertiser')}</th><th>{t('Placement')}</th><th>{t('Dates')}</th><th>{t('Views')}</th><th>{t('Clicks')}</th><th>{t('CTR')}</th><th>{t('Invoice')}</th><th>{t('Status')}</th><th /></tr></thead>
          <tbody>{ads.map((a) => <tr key={a.id}><td><b>{a.title}</b><small className="muted" style={{ display: 'block' }} dir="rtl">{a.titleAr}</small></td><td>{a.advertiser}</td><td>{t(a.placement)}</td><td>{fmtDate(a.start, locale)} – {fmtDate(a.end, locale)}</td><td>{a.views}</td><td>{a.clicks}</td><td>{a.views ? `${((a.clicks / a.views) * 100).toFixed(1)}%` : '—'}</td><td dir="ltr">{a.invoiceId || '—'}</td><td><span className={`badge ${a.status === 'Approved' ? 'green' : a.status === 'Pending' ? 'orange' : 'gray'}`}>{t(a.status)}</span></td>
            <td>{a.status === 'Pending' && <div className="flex gap-1"><button className="btn btn-primary btn-sm" onClick={() => act(() => approveAd(a.id))}><CheckCircle2 size={14} /> {t('Approve')}</button><input className="input input-sm" style={{ maxWidth: 140 }} placeholder={t('Reason')} value={note[a.id] || ''} onChange={(e) => setNote({ ...note, [a.id]: e.target.value })} /><button className="btn btn-outline btn-sm" onClick={() => act(() => rejectAd(a.id, note[a.id]))}><Ban size={14} /></button></div>}
              {a.status === 'Approved' && <button className="btn btn-outline btn-sm" onClick={() => stopAd(a.id)}>{t('Stop')}</button>}</td></tr>)}</tbody></table></div>
        <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('Approving issues the advertiser’s tax invoice in the same series. Advertisers apply at /advertise.')}</p>
      </div>
      <div className="card">
        <h3>{t('Ad packages')}</h3>
        <div className="table-wrap"><table><thead><tr><th>{t('Name')}</th><th>{t('Placement')}</th><th>{t('Days')}</th><th>{t('Price')}</th><th /></tr></thead>
          <tbody>{pk.map((a, i) => <tr key={a.id}><td><input className="input input-sm" value={a.name} onChange={(e) => setPk(pk.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td><td><select className="input input-sm" value={a.placement} onChange={(e) => setPk(pk.map((x, j) => (j === i ? { ...x, placement: e.target.value } : x)))}>{p.ads.placements.map((pl) => <option key={pl}>{pl}</option>)}</select></td><td><input className="input input-sm" type="number" dir="ltr" value={a.days} onChange={(e) => setPk(pk.map((x, j) => (j === i ? { ...x, days: Number(e.target.value) } : x)))} /></td><td><input className="input input-sm" type="number" dir="ltr" value={a.price} onChange={(e) => setPk(pk.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} /></td><td><button className="icon-btn danger" onClick={() => setPk(pk.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div>
        <div className="flex gap-1 mt-1"><button className="btn btn-outline btn-sm" onClick={() => setPk([...pk, { id: `ad-${Date.now().toString(36)}`, name: 'New package', placement: p.ads.placements[0], days: 30, price: 1000 }])}><Plus size={14} /> {t('Add')}</button><button className="btn btn-primary btn-sm" onClick={() => setPlatform('ads.packages', pk, { area: 'Website' })}><Save size={14} /> {t('Save')}</button></div>
      </div>
    </>
  );
}

function Policies() {
  const { t, locale } = useLang();
  const pol = getPlatform().policies;
  const [key, setKey] = useState('terms');
  const cur = pol[key];
  const last = cur.versions[cur.versions.length - 1];
  const [draft, setDraft] = useState({ version: '', effectiveDate: new Date().toISOString().slice(0, 10), en: last.en, ar: last.ar });
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const pick = (k) => { setKey(k); const l = pol[k].versions.slice(-1)[0]; setDraft({ version: '', effectiveDate: new Date().toISOString().slice(0, 10), en: l.en, ar: l.ar }); setConfirm(false); setOk(''); };
  const publish = () => {
    try {
      setErr('');
      if (!/^\d+\.\d+$/.test(draft.version)) throw Object.assign(new Error(''), { key: 'Version: number like 1.1' });
      if (cur.versions.some((v) => v.version === draft.version)) throw Object.assign(new Error(''), { key: 'This version already exists.' });
      const versions = [...cur.versions, { ...draft }];
      if (draft.effectiveDate === new Date().toISOString().slice(0, 10)) setPlatform(`policies.${key}.versions`, versions, { area: 'Policies' });
      else scheduleChange({ path: `policies.${key}.versions`, value: versions, effectiveDate: draft.effectiveDate, label: `${cur.title} v${draft.version}` });
      setOk(t('Version {v} saved. It is shown at the next sign-in from {date} and must be accepted.', { v: draft.version, date: fmtDate(draft.effectiveDate, locale) }));
      setConfirm(false);
    } catch (e) { setErr(e); }
  };
  return (
    <div className="card">
      <div className="chip-group mb-2">{Object.keys(pol).map((k) => <button key={k} className={`chip ${k === key ? 'on' : ''}`} onClick={() => pick(k)}>{t(pol[k].title)}</button>)}</div>
      <h4>{t('Versions')}</h4>
      <ul className="tl-mini">{cur.versions.map((v) => <li key={v.version}><b>v{v.version}</b> · {t('in force from {date}', { date: fmtDate(v.effectiveDate, locale) })}</li>)}</ul>
      <h4 className="mt-2">{t('New version')}</h4>
      {err && <div className="alert error mb-1">{errText(t, err)}</div>}
      {ok && <div className="alert success mb-1"><CheckCircle2 size={16} /> {ok}</div>}
      <div className="form-grid">
        <div className="field"><label>{t('Version')}</label><input className="input" dir="ltr" placeholder="1.1" value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} /></div>
        <div className="field"><label>{t('In force from')}</label><input className="input" type="date" dir="ltr" min={new Date().toISOString().slice(0, 10)} value={draft.effectiveDate} onChange={(e) => setDraft({ ...draft, effectiveDate: e.target.value })} /></div>
        <div className="field full"><label>{t('Text (English)')}</label><textarea className="input" rows="8" value={draft.en} onChange={(e) => setDraft({ ...draft, en: e.target.value })} /></div>
        <div className="field full"><label>{t('Text (Arabic)')}</label><textarea className="input" dir="rtl" rows="8" value={draft.ar} onChange={(e) => setDraft({ ...draft, ar: e.target.value })} /></div>
      </div>
      {!confirm ? <button className="btn btn-primary mt-2" onClick={() => setConfirm(true)}><Eye size={15} /> {t('Review and publish')}</button>
        : <div className="alert warn mt-2" style={{ alignItems: 'center' }}><AlertTriangle size={16} /><span style={{ flex: 1 }}>{t('Every user will have to accept version {v} at their next sign-in. Confirm?', { v: draft.version || '?' })}</span><button className="btn btn-primary btn-sm" onClick={publish}>{t('Confirm and publish')}</button><button className="btn btn-outline btn-sm" onClick={() => setConfirm(false)}>{t('Cancel')}</button></div>}
    </div>
  );
}

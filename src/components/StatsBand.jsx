import { useEffect, useRef, useState } from 'react';
import { Building2, Activity, ShieldCheck, Award } from 'lucide-react';
import { useLang } from '../i18n/LanguageContext';

const stats = [
  { icon: Building2, color: '#0f5c94', value: 10000, suffix: '+', label: 'Connected companies', sub: 'across 40+ countries' },
  { icon: Activity, color: '#1a86a6', value: 99.5, suffix: '%', decimals: 1, label: 'Availability target', sub: 'monitored 24/7' },
  { icon: ShieldCheck, color: '#b07f3e', value: 34, label: 'Validation checkpoints', sub: 'PINT AE & EN 16931' },
  { icon: Award, color: '#092f58', text: 'ISO 27001', label: 'Certified security', sub: '& ISO 22301 continuity' },
];

function CountUp({ to, decimals = 0, suffix = '', start }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!start) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setN(to); return undefined; }
    let raf; const t0 = performance.now(); const dur = 1400;
    const step = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(to * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, start]);
  return <>{n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</>;
}

export default function StatsBand() {
  const { t } = useLang();
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="stats-wrap">
      <div className="container">
        <div className="stats" ref={ref}>
          {stats.map(({ icon: Icon, color, value, suffix, decimals, text, label, sub }) => (
            <div className="stat" key={label} style={{ '--c': color }}>
              <span className="stat-ic"><Icon size={20} /></span>
              <div>
                <strong className="stat-num" dir="ltr">
                  {text || <CountUp to={value} suffix={suffix} decimals={decimals} start={seen} />}
                </strong>
                <span className="stat-label">{t(label)}</span>
                <span className="stat-sub">{t(sub)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

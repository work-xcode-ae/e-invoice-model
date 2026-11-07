import { useEffect, useState } from 'react';
import { DB_EVENT } from '../services/api';

/** Re-renders the calling component whenever the mock database changes (this tab or another). */
export function useDbVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const bump = () => setV((x) => x + 1);
    window.addEventListener(DB_EVENT, bump);
    window.addEventListener('storage', bump);
    return () => { window.removeEventListener(DB_EVENT, bump); window.removeEventListener('storage', bump); };
  }, []);
  return v;
}

// System logs used by the admin panel: transaction log, White Label responses, errors, user activity.
import { read, write } from './api';

const LOGS_KEY = 'mei_logs';
const MAX = 600;

/**
 * type: 'transaction' | 'wl' | 'error' | 'activity'
 * action / details are English templates (+ vars) so the admin UI can translate them.
 */
export function addLog({ type, userId = null, company = '', action, details = '', vars = {}, at }) {
  const logs = read(LOGS_KEY, []);
  logs.unshift({ id: Math.random().toString(36).slice(2, 10), at: at || new Date().toISOString(), type, userId, company, action, details, vars });
  write(LOGS_KEY, logs.slice(0, MAX));
}

export const getLogs = (type) => {
  const logs = read(LOGS_KEY, []);
  return type ? logs.filter((l) => l.type === type) : logs;
};

export const clearLogs = () => write(LOGS_KEY, []);

const STORAGE_KEY = 'animap_error_log';
const MAX_ENTRIES = 50;

interface ErrorEntry {
  id: number;
  time: string;
  type: string;
  message: string;
  stack?: string;
  url: string;
  userAgent: string;
}

export function logError(type: string, message: string, stack?: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const entries: ErrorEntry[] = raw ? JSON.parse(raw) : [];

    entries.push({
      id: Date.now(),
      time: new Date().toISOString(),
      type,
      message: String(message).slice(0, 500),
      stack: stack?.slice(0, 1000),
      url: window.location.href,
      userAgent: navigator.userAgent.slice(0, 200),
    });

    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage 满或不可用，静默失败
  }
}

export function getErrorLog(): ErrorEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearErrorLog(): void {
  localStorage.removeItem(STORAGE_KEY);
}

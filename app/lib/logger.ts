import { Platform } from 'react-native';
import { API_BASE } from '@/lib/api';

// Client error logging → POST /logs → D1 client_logs. Captures uncaught JS
// errors AND console.error (which is where RN render warnings like "Text
// strings must be rendered within a <Text>" land), so "go look at the logs" is
// a single D1 query. Best-effort and self-protecting: it never throws, caps its
// own queue, and never logs its own network failures (no recursion).

type TokenGetter = () => Promise<string | null>;
let tokenGetter: TokenGetter | null = null;
let installed = false;
let flushing = false;
const queue: Record<string, unknown>[] = [];

export function setLogTokenGetter(fn: TokenGetter | null): void {
  tokenGetter = fn;
  if (fn) flush();
}

function enqueue(level: string, message: string, stack?: string | null, context?: string): void {
  if (!message) return;
  queue.push({
    level, message: String(message).slice(0, 2000),
    stack: stack ? String(stack).slice(0, 4000) : null,
    context: context ?? null, platform: Platform.OS,
    at: new Date().toISOString(),
  });
  while (queue.length > 50) queue.shift();
  flush();
}

async function flush(): Promise<void> {
  if (flushing || queue.length === 0 || !tokenGetter) return;
  flushing = true;
  try {
    const token = await tokenGetter().catch(() => null);
    if (!token) return; // not signed in yet — stays queued
    const batch = queue.splice(0, queue.length);
    await fetch(`${API_BASE}/logs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: batch }),
    }).catch(() => { /* drop — never recurse on a logging failure */ });
  } finally {
    flushing = false;
  }
}

// Explicit error report from a catch block.
export function logError(e: unknown, context?: string): void {
  const err = e as { message?: string; stack?: string };
  enqueue('error', err?.message ?? String(e), err?.stack, context);
}

// Install global capture. Call once at app start.
export function installLogging(): void {
  if (installed) return;
  installed = true;

  // Uncaught JS errors (RN's global handler).
  const g = global as unknown as {
    ErrorUtils?: { getGlobalHandler?: () => any; setGlobalHandler?: (h: (e: any, fatal?: boolean) => void) => void };
  };
  if (g.ErrorUtils?.setGlobalHandler) {
    const prev = g.ErrorUtils.getGlobalHandler?.();
    g.ErrorUtils.setGlobalHandler((err: any, isFatal?: boolean) => {
      enqueue(isFatal ? 'fatal' : 'error', err?.message ?? String(err), err?.stack, 'global');
      prev?.(err, isFatal);
    });
  }

  // console.error — where RN render warnings/errors surface.
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      const msg = args.map((a) =>
        a instanceof Error ? a.message : typeof a === 'string' ? a : safeStringify(a)
      ).join(' ');
      if (msg && !msg.includes('/logs')) {
        const errArg = args.find((a) => a instanceof Error) as Error | undefined;
        enqueue('console', msg, errArg?.stack, 'console.error');
      }
    } catch { /* never let logging break logging */ }
    orig(...args);
  };
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

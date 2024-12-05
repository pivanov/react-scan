import type { Render } from './instrumentation/index';

export const getLabelText = (renders: Array<Render>) => {
  let labelText = '';

  const components = new Map<
    string,
    {
      count: number;
      trigger: boolean;
      forget: boolean;
    }
  >();

  for (let i = 0, len = renders.length; i < len; i++) {
    const render = renders[i];
    const name = render.name;
    if (!name?.trim()) continue;

    const { count, trigger, forget } = components.get(name) ?? {
      count: 0,
      trigger: false,
      forget: false,
    };
    components.set(name, {
      count: count + render.count,
      trigger: trigger || render.trigger,
      forget: forget || render.forget,
    });
  }

  const sortedComponents = Array.from(components.entries()).sort(
    ([, a], [, b]) => b.count - a.count,
  );

  const parts: Array<string> = [];
  for (const [name, { count, forget }] of sortedComponents) {
    let text = name;
    if (count > 1) {
      text += ` ×${count}`;
    }

    if (forget) {
      text = `${text} ✨`;
    }
    parts.push(text);
  }

  labelText = parts.join(' ');

  if (!labelText.length) return null;
  if (labelText.length > 20) {
    labelText = `${labelText.slice(0, 20)}…`;
  }
  return labelText;
};

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS = {
  debug: '#7f8c8d', // Gray
  info: '#2ecc71', // Green
  warn: '#f1c40f', // Yellow
  error: '#e74c3c', // Red
};

const isProd = () => {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.MODE === 'production' ||
    // @ts-expect-error
    process.env.PROD === true ||
    // @ts-expect-error
    (typeof import.meta !== 'undefined' && import.meta.env?.PROD) ||
    // @ts-expect-error
    (typeof import.meta !== 'undefined' &&
      // @ts-expect-error
      import.meta.env?.MODE === 'production') ||
    window.location.hostname !== 'localhost'
  );
};

// Global logger configuration
const loggerConfig: LoggerConfig = {
  enabled: false,
  level: 'info',
};

// @ts-expect-error
window.__SCAN_DEBUG__ = true;

if (typeof window !== 'undefined') {
  const isDebugEnabled =
    new URLSearchParams(window.location.search).has('debug') ||
    !!(window as any).__SCAN_DEBUG__;

  loggerConfig.enabled = isProd()
    ? !!(window as any).__SCAN_DEBUG_PROD__ // Only enable in prod if special flag is set
    : isDebugEnabled; // Normal debug rules in dev
}

export const logger = {
  setEnabled(enabled: boolean) {
    loggerConfig.enabled = enabled;
  },

  setLevel(level: LogLevel) {
    loggerConfig.level = level;
  },

  debug(...args: any[]) {
    this._log('debug', ...args);
  },

  info(...args: any[]) {
    this._log('info', ...args);
  },

  warn(...args: any[]) {
    this._log('warn', ...args);
  },

  error(...args: any[]) {
    this._log('error', ...args);
  },

  _log(level: LogLevel, ...args: any[]) {
    if (
      !loggerConfig.enabled ||
      LOG_LEVELS[level] < LOG_LEVELS[loggerConfig.level]
    ) {
      return;
    }

    if (typeof window !== 'undefined' && window.console) {
      console[level === 'debug' ? 'log' : level](
        '%c',
        `color: ${COLORS[level]}`,
        ...args,
      );
    }
  },
};

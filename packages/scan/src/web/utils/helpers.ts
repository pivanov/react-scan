import {
  type Fiber,
  ForwardRefTag,
  MemoComponentTag,
  SimpleMemoComponentTag,
  SuspenseComponentTag,
  getDisplayName,
} from 'bippy';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: Array<ClassValue>): string => {
  return twMerge(clsx(inputs));
};

export const isFirefox =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('Firefox');

export const onIdle = (callback: () => void) => {
  if ('scheduler' in globalThis) {
    return globalThis.scheduler.postTask(callback, {
      priority: 'background',
    });
  }
  if ('requestIdleCallback' in window) {
    return requestIdleCallback(callback);
  }
  return setTimeout(callback, 0);
};

export const throttle = <E>(
  callback: (e?: E) => void,
  delay: number,
): ((e?: E) => void) => {
  let lastCall = 0;
  return (e?: E) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return callback(e);
    }
    return undefined;
  };
};

export const tryOrElse = <T>(fn: () => T, defaultValue: T): T => {
  try {
    return fn();
  } catch {
    return defaultValue;
  }
};

export const readLocalStorage = <T>(storageKey: string): T | null => {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

export const saveLocalStorage = <T>(storageKey: string, state: T): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {}
};
export const removeLocalStorage = (storageKey: string): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(storageKey);
  } catch {}
};

export const toggleMultipleClasses = (
  element: HTMLElement,
  classes: Array<string>,
) => {
  for (const cls of classes) {
    element.classList.toggle(cls);
  }
};

interface WrapperBadge {
  type: 'memo' | 'forwardRef' | 'lazy' | 'suspense' | 'profiler' | 'strict';
  title: string;
  compiler?: boolean;
}

export interface ExtendedDisplayName {
  name: string | null;
  wrappers: Array<string>;
  wrapperTypes: Array<WrapperBadge>;
}

// React internal tags not exported by bippy
const LazyComponentTag = 24;
const ProfilerTag = 12;

export const getExtendedDisplayName = (fiber: Fiber): ExtendedDisplayName => {
  if (!fiber) {
    return {
      name: 'Unknown',
      wrappers: [],
      wrapperTypes: [],
    };
  }

  const { tag, type } = fiber;

  let name = getDisplayName(type);
  const wrappers: Array<string> = [];

  // Check for wrapped components like Foo(Bar(Component))
  // Match the outermost wrapper first, then work inwards
  while (name && /^(\w+)\((.*)\)$/.test(name)) {
    const wrapper = name.match(/^(\w+)\(/)?.[1];
    if (wrapper) {
      wrappers.unshift(wrapper); // Add to start of array to maintain order
      name = name.slice(wrapper.length + 1, -1); // Remove wrapper and parentheses
    }
  }

  const wrapperTypes: Array<WrapperBadge> = [];

  // Process wrappers in order they appear in the displayName
  for (const wrapper of wrappers) {
    if (wrapper.toLowerCase().includes('memo')) {
      wrapperTypes.push({
        type: 'memo',
        title: 'Memoized component that skips re-renders if props are the same',
        compiler: false,
      });
    } else if (wrapper.toLowerCase().includes('forwardref')) {
      wrapperTypes.push({
        type: 'forwardRef',
        title:
          'Component that can forward refs to DOM elements or other components',
      });
    }
  }

  // Check for React compiler auto-memoization
  if (
    typeof type === 'function' &&
    type !== null &&
    '_automaticMemoized' in type
  ) {
    wrapperTypes.push({
      type: 'memo',
      title: 'This component has been auto-memoized by the React Compiler',
      compiler: true,
    });
  }

  // Add wrappers based on fiber tags
  if (
    (tag === SimpleMemoComponentTag || tag === MemoComponentTag) &&
    !wrapperTypes.some((w) => w.type === 'memo' && !w.compiler)
  ) {
    wrapperTypes.push({
      type: 'memo',
      title: 'Memoized component that skips re-renders if props are the same',
      compiler: false,
    });
  }

  if (
    tag === ForwardRefTag &&
    !wrapperTypes.some((w) => w.type === 'forwardRef')
  ) {
    wrapperTypes.push({
      type: 'forwardRef',
      title:
        'Component that can forward refs to DOM elements or other components',
    });
  }

  if (tag === LazyComponentTag) {
    wrapperTypes.push({
      type: 'lazy',
      title: 'Lazily loaded component that supports code splitting',
    });
  }

  if (tag === SuspenseComponentTag) {
    wrapperTypes.push({
      type: 'suspense',
      title: 'Component that can suspend while content is loading',
    });
  }

  if (tag === ProfilerTag) {
    wrapperTypes.push({
      type: 'profiler',
      title: 'Component that measures rendering performance',
    });
  }

  return {
    name: name || 'Unknown',
    wrappers,
    wrapperTypes,
  };
};

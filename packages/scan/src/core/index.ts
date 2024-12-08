import type { Fiber, FiberRoot } from 'react-reconciler';
import * as React from 'react';
import { instrument, type Render } from './instrumentation/index';
import {
  type ActiveOutline,
  flushOutlines,
  getOutline,
  type PendingOutline,
} from './web/outline';
import { logIntro } from './web/log';
import { playGeigerClickSound } from './web/geiger';
import { createPerfObserver } from './web/perf-observer';
import {
  createInspectElementStateMachine,
  type States,
} from './web/inspect-element/inspect-state-machine';
import { createToolbar } from './web/toolbar';
import { getType } from './instrumentation/utils';

export interface Options {
  /**
   * Enable/disable scanning
   *
   * Please use the recommended way:
   * enabled: process.env.NODE_ENV === 'development',
   *
   * @default true
   */
  enabled?: boolean;
  /**
   * Include children of a component applied with withScan
   *
   * @default true
   */
  includeChildren?: boolean;

  /**
   * Enable/disable geiger sound
   *
   * @default true
   */
  playSound?: boolean;

  /**
   * Log renders to the console
   *
   * @default false
   */
  log?: boolean;

  /**
   * Show toolbar bar
   *
   * @default true
   */
  showToolbar?: boolean;

  /**
   * Render count threshold, only show
   * when a component renders more than this
   *
   * @default 0
   */
  renderCountThreshold?: number;

  /**
   * Clear aggregated fibers after this time in milliseconds
   *
   * @default 5000
   */
  resetCountTimeout?: number;

  /**
   * Maximum number of renders for red indicator
   *
   * @default 20
   */
  maxRenders?: number;

  /**
   * Report data to getReport()
   *
   * @default false
   */
  report?: boolean;

  /**
   * Always show labels
   *
   * @default false
   */
  alwaysShowLabels?: boolean;

  /**
   * Animation speed
   *
   * @default "fast"
   */
  animationSpeed?: 'slow' | 'fast' | 'off';

  onCommitStart?: () => void;
  onRender?: (fiber: Fiber, render: Render) => void;
  onCommitFinish?: () => void;
  onPaintStart?: (outlines: Array<PendingOutline>) => void;
  onPaintFinish?: (outlines: Array<PendingOutline>) => void;
}

export interface Internals {
  onCommitFiberRoot: (rendererID: number, root: FiberRoot) => void;
  isInIframe: boolean;
  isPaused: boolean;
  componentAllowList: WeakMap<React.ComponentType<any>, Options> | null;
  options: Options;
  scheduledOutlines: Array<PendingOutline>;
  activeOutlines: Array<ActiveOutline>;
  onRender: ((fiber: Fiber, render: Render) => void) | null;
  reportDataByFiber: WeakMap<
    Fiber,
    {
      count: number;
      time: number;
      badRenders: Array<Render>;
      displayName: string | null;
    }
  >;
  reportData: Record<
    string,
    {
      count: number;
      time: number;
      type: unknown;
      badRenders: Array<Render>;
    }
  >;
  fiberRoots: WeakSet<Fiber>;
  inspectState: States;
}

type Listener<T> = (value: T) => void;

export interface StoreMethods<T extends object> {
  subscribe: <K extends keyof T>(
    key: K,
    listener: Listener<T[K]>,
  ) => () => void;
  set: <K extends keyof T>(key: K, value: T[K]) => void;
  setState: (state: Partial<T>) => void;
  emit: <K extends keyof T>(key: K, value: T[K]) => void;
  subscribeMultiple: (
    subscribeTo: Array<keyof T>,
    listener: Listener<T>,
  ) => () => void;
}

type Store<T extends object> = T & StoreMethods<T>;

const createStore = <T extends object>(initialData: T): Store<T> => {
  const data: T = { ...initialData };
  const listeners: { [K in keyof T]?: Array<Listener<T[K]>> } = {};

  const emit = <K extends keyof T>(key: K, value: T[K]): void => {
    listeners[key]?.forEach((listener) => listener(value));
  };

  const set = <K extends keyof T>(key: K, value: T[K]): void => {
    if (data[key] !== value) {
      data[key] = value;
      emit(key, value);
    }
  };

  const subscribe = <K extends keyof T>(
    key: K,
    listener: Listener<T[K]>,
  ): (() => void) => {
    if (!listeners[key]) {
      listeners[key] = [];
    }
    listeners[key]!.push(listener);
    listener(data[key]);
    return () => {
      listeners[key] = listeners[key]!.filter((l) => l !== listener);
    };
  };

  const setState = (state: Partial<T>) => {
    for (const key in state) {
      if (Object.prototype.hasOwnProperty.call(state, key)) {
        set(key as keyof T, state[key] as T[keyof T]);
      }
    }
  };

  const subscribeMultiple = (
    subscribeTo: Array<keyof T>,
    listener: (store: typeof data) => void,
  ) => {
    subscribeTo.forEach((key) => {
      if (!listeners[key]) {
        listeners[key] = [];
      }
      listeners[key]?.push(() => listener(data));
    });

    return () => {
      subscribeTo.forEach((key) => {
        listeners[key] = listeners[key]?.filter((cb) => cb !== listener);
      });
    };
  };

  const proxy = new Proxy(data, {
    get(target, prop, receiver) {
      if (prop === 'subscribe') return subscribe;
      if (prop === 'setState') return setState;
      if (prop === 'emit') return emit;
      if (prop === 'set') return set;
      if (prop === 'subscribeMultiple') return subscribeMultiple;

      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value) {
      if (prop in target) {
        set(prop as keyof T, value as T[keyof T]);
        return true;
      }
      throw new Error(`Property "${String(prop)}" does not exist`);
    },
    deleteProperty(_, prop) {
      throw new Error(`Cannot delete property "${String(prop)}" from store`);
    },
  });

  return proxy as Store<T>;
};

const tryParse = (x: any) => {
  try {
    return JSON.parse(x);
  } catch {
    return 'false';
  }
};
export const ReactScanInternals = createStore<Internals>({
  onCommitFiberRoot: (_rendererID: number, _root: FiberRoot): void => {
    /**/
  },
  isInIframe: typeof window !== 'undefined' && window.self !== window.top,
  isPaused:
    typeof window === 'undefined'
      ? true
      : tryParse(localStorage.getItem('react-scan-paused') ?? 'false'),
  componentAllowList: null,
  options: {
    enabled: true,
    includeChildren: true,
    playSound: false,
    log: false,
    showToolbar: true,
    renderCountThreshold: 0,
    report: undefined,
    alwaysShowLabels: false,
    animationSpeed: 'fast',
  },
  onRender: null,
  reportData: {},
  reportDataByFiber: new WeakMap(),
  scheduledOutlines: [],
  activeOutlines: [],
  fiberRoots: new WeakSet(),
  inspectState: {
    kind: 'uninitialized',
  },
});

export const getReport = () => ReactScanInternals.reportData;

export const setOptions = (options: Options) => {
  ReactScanInternals.options = {
    ...ReactScanInternals.options,
    ...options,
  };
};

export const getOptions = () => ReactScanInternals.options;

export const start = () => {
  if (typeof window === 'undefined') {
    return;
  }

  if (ReactScanInternals.options.showToolbar) {
    createToolbar();
  }

  // Get the shadow root from our container
  const container = document.getElementById('react-scan-root');
  const shadow = container?.shadowRoot;

  if (!shadow) {
    return;
  }

  const overlayElement = document.createElement('canvas');
  overlayElement.id = 'react-scan-overlay';
  shadow.appendChild(overlayElement);

  const ctx = overlayElement.getContext('2d');
  if (!ctx) return;

  // Add resize handling
  const updateCanvasSize = () => {
    overlayElement.width = window.innerWidth * window.devicePixelRatio;
    overlayElement.height = window.innerHeight * window.devicePixelRatio;
    overlayElement.style.width = `${window.innerWidth}px`;
    overlayElement.style.height = `${window.innerHeight}px`;
  };

  window.addEventListener('resize', updateCanvasSize);
  window.addEventListener('scroll', () => {
    flushOutlines(ctx, new Map());
  });

  // Initial size setup
  updateCanvasSize();

  createInspectElementStateMachine();

  const audioContext =
    typeof window !== 'undefined'
      ? new (window.AudioContext ||
          // @ts-expect-error -- This is a fallback for Safari
          window.webkitAudioContext)()
      : null;
  createPerfObserver();

  logIntro();

  globalThis.__REACT_SCAN__ = {
    ReactScanInternals,
  };

  instrument({
    onCommitStart() {
      ReactScanInternals.options.onCommitStart?.();
    },
    onRender(fiber, render) {
      if (ReactScanInternals.isPaused) {
        // don't draw if it's paused
        return;
      }
      ReactScanInternals.options.onRender?.(fiber, render);
      const outline = getOutline(fiber, render);
      if (!outline) return;
      ReactScanInternals.scheduledOutlines.push(outline);

      if (ReactScanInternals.options.playSound && audioContext) {
        const renderTimeThreshold = 10;
        const amplitude = Math.min(
          1,
          (render.time - renderTimeThreshold) / (renderTimeThreshold * 2),
        );
        playGeigerClickSound(audioContext, amplitude);
      }
      flushOutlines(ctx, new Map());
    },
    onCommitFinish() {
      ReactScanInternals.options.onCommitFinish?.();
    },
  });
};

export const withScan = <T>(
  component: React.ComponentType<T>,
  options: Options = {},
) => {
  setOptions(options);
  const { isInIframe, componentAllowList } = ReactScanInternals;
  if (isInIframe || options.enabled === false) return component;
  if (!componentAllowList) {
    ReactScanInternals.componentAllowList = new WeakMap<
      React.ComponentType<any>,
      Options
    >();
  }
  if (componentAllowList) {
    componentAllowList.set(component, { ...options });
  }

  start();

  return component;
};

export const scan = (options: Options = {}) => {
  setOptions(options);
  const { isInIframe } = ReactScanInternals;
  if (isInIframe || options.enabled === false) return;

  start();
};

export const useScan = (options: Options) => {
  React.useEffect(() => {
    scan(options);
  }, []);
};

export const onRender = (
  type: unknown,
  _onRender: (fiber: Fiber, render: Render) => void,
) => {
  const prevOnRender = ReactScanInternals.onRender;
  ReactScanInternals.onRender = (fiber, render) => {
    prevOnRender?.(fiber, render);
    if (getType(fiber.type) === type) {
      _onRender(fiber, render);
    }
  };
};

export const getRenderInfo = (type: unknown) => {
  type = getType(type) || type;
  const reportData = ReactScanInternals.reportData;
  for (const componentName in reportData) {
    if (reportData[componentName].type === type) {
      return reportData[componentName];
    }
  }
  return null;
};

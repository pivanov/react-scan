import {
  isCompositeFiber,
  isHostFiber,
  FunctionComponentTag,
  ForwardRefTag,
  SimpleMemoComponentTag,
  MemoComponentTag,
  traverseFiber,
} from 'bippy';
import { type Fiber } from 'react-reconciler';
import { type ComponentState } from 'react';
import { ReactScanInternals, Store } from '../../index';

interface OverrideMethods {
  overrideProps: ((fiber: Fiber, path: Array<string>, value: unknown) => void) | null;
  overrideHookState: ((fiber: Fiber, id: string, path: Array<unknown>, value: unknown) => void) | null;
}
interface ReactRootContainer {
  _reactRootContainer?: {
    _internalRoot?: {
      current?: {
        child: Fiber;
      };
    };
  };
}

interface ReactInternalProps {
  [key: string]: Fiber;
}

interface ReactRenderer {
  bundleType: number;
  rendererPackageName?: string;
  overrideProps?: (fiber: Fiber, path: Array<string>, value: any) => void;
  overrideHookState?: (fiber: Fiber, id: string, path: Array<any>, value: any) => void;
}

interface ContextDependency<T = unknown> {
  context: ReactContext<T>;
  next: ContextDependency<T> | null;
}

interface ContextValue {
  displayValue: Record<string, unknown>;
  rawValue?: unknown;
  isUserContext?: boolean;
}

interface ReactContext<T = unknown> {
  $$typeof: symbol;
  Consumer: ReactContext<T>;
  Provider: {
    $$typeof: symbol;
    _context: ReactContext<T>;
  };
  _currentValue: T;
  _currentValue2: T;
  displayName?: string;
}

export const getFiberFromElement = (element: Element): Fiber | null => {
  if ('__REACT_DEVTOOLS_GLOBAL_HOOK__' in window) {
    const { renderers } = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!renderers) return null;
    for (const [, renderer] of Array.from(renderers)) {
      try {
        // @ts-expect-error - renderer.findFiberByHostInstance is not typed
        const fiber = renderer.findFiberByHostInstance(element);
        if (fiber) return fiber;
      } catch (e) {
        // If React is mid-render, references to previous nodes may disappear
      }
    }
  }

  if ('_reactRootContainer' in element) {
    const elementWithRoot = element as unknown as ReactRootContainer;
    const rootContainer = elementWithRoot._reactRootContainer;
    return rootContainer?._internalRoot?.current?.child ?? null;
  }

  for (const key in element) {
    if (
      key.startsWith('__reactInternalInstance$') ||
      key.startsWith('__reactFiber')
    ) {
      const elementWithFiber = element as unknown as ReactInternalProps;
      return elementWithFiber[key];
    }
  }
  return null;
};

export const getFirstStateNode = (fiber: Fiber): Element | null => {
  let current: Fiber | null = fiber;
  while (current) {
    if (current.stateNode instanceof Element) {
      return current.stateNode;
    }

    if (!current.child) {
      break;
    }
    current = current.child;
  }

  while (current) {
    if (current.stateNode instanceof Element) {
      return current.stateNode;
    }

    if (!current.return) {
      break;
    }
    current = current.return;
  }
  return null;
};

export const getNearestFiberFromElement = (element: Element | null): Fiber | null => {
  if (!element) return null;

  try {
    const fiber = getFiberFromElement(element);
    if (!fiber) return null;

    const res = getParentCompositeFiber(fiber);
    return res ? res[0] : null;
  } catch (error) {
    return null;
  }
};

export const getParentCompositeFiber = (fiber: Fiber) => {
  let curr: Fiber | null = fiber;
  let prevNonHost = null;

  while (curr) {
    if (isCompositeFiber(curr)) {
      return [curr, prevNonHost] as const;
    }
    if (isHostFiber(curr)) {
      prevNonHost = curr;
    }
    curr = curr.return;
  }
};

interface PropChange {
  name: string;
  value: unknown;
  prevValue?: unknown;
}

export const getChangedPropsDetailed = (fiber: Fiber): Array<PropChange> => {
  const currentProps = fiber.memoizedProps ?? {};
  const previousProps = fiber.alternate?.memoizedProps ?? {};
  const changes: Array<PropChange> = [];

  for (const key in currentProps) {
    if (key === 'children') continue;

    const currentValue = currentProps[key];
    const prevValue = previousProps[key];

    if (!Object.is(currentValue, prevValue)) {
      changes.push({
        name: key,
        value: currentValue,
        prevValue
      });
    }
  }

  return changes;
};


// Simple counters for changes
const stateChangeCounts = new Map<string, number>();
const propsChangeCounts = new Map<string, number>();
const contextChangeCounts = new Map<string, number>();

// Reset all tracking
export const resetStateTracking = (): void => {
  stateChangeCounts.clear();
  propsChangeCounts.clear();
  contextChangeCounts.clear();
};

// Simple change detection for props
export const getChangedProps = (fiber: Fiber): Set<string> => {
  const changes = new Set<string>();
  if (!fiber.alternate) return changes;

  const previousProps = fiber.alternate.memoizedProps ?? {};
  const currentProps = fiber.memoizedProps ?? {};

  // Check changed or new props
  for (const key in currentProps) {
    if (key === 'children') continue;
    if (!Object.is(currentProps[key], previousProps[key])) {
      changes.add(key);
      const count = (propsChangeCounts.get(key) ?? 0) + 1;
      propsChangeCounts.set(key, count);
    }
  }

  // Check deleted props
  for (const key in previousProps) {
    if (key === 'children') continue;
    if (!(key in currentProps)) {
      changes.add(key);
      const count = (propsChangeCounts.get(key) ?? 0) + 1;
      propsChangeCounts.set(key, count);
    }
  }

  return changes;
};

// Simple change detection for state
export const getChangedState = (fiber: Fiber): Set<string> => {
  const changes = new Set<string>();
  if (!fiber.alternate) return changes;

  let currentState = fiber.memoizedState;
  let previousState = fiber.alternate.memoizedState;
  const stateNames = getStateNames(fiber);

  // Only track actual state hooks (with queue)
  let index = 0;
  while (currentState && previousState) {
    if (currentState.queue) {
      if (currentState.memoizedState !== previousState.memoizedState) {
        const name = stateNames[index] ?? `state${index}`;
        changes.add(name);
        const count = (stateChangeCounts.get(name) ?? 0) + 1;
        stateChangeCounts.set(name, count);
      }
      index++;
    }
    currentState = currentState.next;
    previousState = previousState.next;
  }

  return changes;
};

// Simplified context handling
export const getAllFiberContexts = (fiber: Fiber): Map<string, ContextValue> => {
  const contexts = new Map<string, ContextValue>();
  if (!fiber) return contexts;

  const findProviderValue = (contextType: ReactContext): { value: ContextValue; displayName: string } | null => {
    let searchFiber: Fiber | null = fiber;
    while (searchFiber) {
      if (searchFiber.type?.Provider) {
        const providerValue = searchFiber.memoizedProps?.value;
        const pendingValue = searchFiber.pendingProps?.value;
        const currentValue = contextType._currentValue;

        // For built-in contexts
        if (contextType.displayName) {
          if (currentValue === null) {
            return null;
          }
          return {
            value: {
              displayValue: ensureRecord(currentValue),
              isUserContext: false,
              rawValue: currentValue
            },
            displayName: contextType.displayName
          };
        }

        // For user-defined contexts
        const providerName = searchFiber.type.name?.replace('Provider', '') ??
          searchFiber._debugOwner?.type?.name ??
          'Unnamed';

        const valueToUse = pendingValue !== undefined ? pendingValue :
          providerValue !== undefined ? providerValue :
            currentValue;

        return {
          value: {
            displayValue: ensureRecord(valueToUse),
            isUserContext: true,
            rawValue: valueToUse
          },
          displayName: providerName
        };
      }
      searchFiber = searchFiber.return;
    }
    return null;
  };

  let currentFiber: Fiber | null = fiber;
  while (currentFiber) {
    if (currentFiber.dependencies?.firstContext) {
      let contextItem = currentFiber.dependencies.firstContext as ContextDependency | null;
      while (contextItem !== null) {
        const context = contextItem.context;
        if (context && '_currentValue' in context) {
          const result = findProviderValue(context);
          if (result) {
            contexts.set(result.displayName, result.value);
          }
        }
        contextItem = contextItem.next;
      }
    }
    currentFiber = currentFiber.return;
  }

  return contexts;
};

const ensureRecord = (value: unknown): Record<string, unknown> => {
  if (value === null || value === undefined) {
    return {};
  }
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return { value };
};

export const getCurrentContext = (fiber: Fiber) => {
  const contexts = getAllFiberContexts(fiber);
  const contextObj: Record<string, unknown> = {};

  contexts.forEach((value, contextName) => {
    contextObj[contextName] = value.displayValue;
  });

  return contextObj;
};

// Simple change detection for context
export const getChangedContext = (fiber: Fiber): Set<string> => {
  const changes = new Set<string>();
  if (!fiber.alternate) return changes;

  const currentContexts = getAllFiberContexts(fiber);
  const previousContexts = getAllFiberContexts(fiber.alternate);

  currentContexts.forEach((currentValue, contextName) => {
    const previousValue = previousContexts.get(contextName);
    if (!previousValue || !Object.is(currentValue.rawValue, previousValue.rawValue)) {
      changes.add(contextName);
      const count = (contextChangeCounts.get(contextName) ?? 0) + 1;
      contextChangeCounts.set(contextName, count);
    }
  });

  return changes;
};

// Simple getters for change counts
export const getStateChangeCount = (name: string): number => stateChangeCounts.get(name) ?? 0;
export const getPropsChangeCount = (name: string): number => propsChangeCounts.get(name) ?? 0;
export const getContextChangeCount = (name: string): number => contextChangeCounts.get(name) ?? 0;

const STATE_NAME_REGEX = /\[(?<name>\w+),\s*set\w+\]/g;

export const getStateNames = (fiber: Fiber): Array<string> => {
  const componentSource = fiber.type?.toString?.() || '';
  return componentSource ? Array.from(
    componentSource.matchAll(STATE_NAME_REGEX),
    (m: RegExpMatchArray) => m.groups?.name ?? ''
  ) : [];
};

export const getStateFromFiber = (fiber: Fiber | null): Record<string, unknown> => {
  if (!fiber) return {};

  try {
    if (
      fiber.tag === FunctionComponentTag ||
      fiber.tag === ForwardRefTag ||
      fiber.tag === SimpleMemoComponentTag ||
      fiber.tag === MemoComponentTag
    ) {
      let memoizedState = fiber.memoizedState;
      const state: Record<string, unknown> = {};
      const stateNames = getStateNames(fiber);

      let index = 0;
      while (memoizedState) {
        // Check for both queue and memoizedState
        if (memoizedState.queue) {
          const name = stateNames[index] ?? `state${index}`;

          // Get the latest state value from the queue's last rendered state
          let value = memoizedState.queue.lastRenderedState ?? memoizedState.memoizedState;

          // If there are pending updates, apply them
          if (memoizedState.queue.pending) {
            const pending = memoizedState.queue.pending;
            let update = pending.next;
            let baseState = value;

            do {
              if (update?.payload) {
                baseState = typeof update.payload === 'function'
                  ? update.payload(baseState)
                  : update.payload;
              }
              update = update.next;
            } while (update !== null && update !== pending.next);

            value = baseState;
          }

          // Store the value
          state[name] = value;
        }
        memoizedState = memoizedState.next;
        index++;
      }
      return state;
    }
  } catch {
    /* Silently fail */
  }
  return {};
};

export const isValidObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

export const hasValidParent = () => {
  if (Store.inspectState.value.kind !== 'focused') {
    return false;
  }

  const { focusedDomElement } = Store.inspectState.value;
  if (!focusedDomElement) {
    return false;
  }

  let hasValidParent = false;
  if (focusedDomElement.parentElement) {
    const currentFiber = getNearestFiberFromElement(focusedDomElement);
    let nextParent: typeof focusedDomElement.parentElement | null =
      focusedDomElement.parentElement;

    while (nextParent) {
      const parentFiber = getNearestFiberFromElement(nextParent);
      if (!parentFiber || parentFiber !== currentFiber) {
        hasValidParent = true;
        break;
      }
      nextParent = nextParent.parentElement;
    }
  }
  return hasValidParent;
};

export const getOverrideMethods = (): OverrideMethods => {
  let overrideProps = null;
  let overrideHookState = null;

  if ('__REACT_DEVTOOLS_GLOBAL_HOOK__' in window) {
    const { renderers } = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (renderers) {
      for (const [, renderer] of Array.from(renderers)) {
        try {
          const typedRenderer = renderer as unknown as ReactRenderer;

          if (typedRenderer.bundleType === 1 && typedRenderer.rendererPackageName === 'react-dom') {
            overrideProps = typedRenderer.overrideProps ?? null;
            overrideHookState = typedRenderer.overrideHookState ?? null;
            break;
          }
        } catch (e) {
          /**/
        }
      }
    }
  }

  return { overrideProps, overrideHookState };
};

export const getCurrentProps = (fiber: Fiber): Record<string, unknown> => {
  return fiber.memoizedProps ?? {};
};

export const getCurrentState = (fiber: Fiber | null) => {
  if (!fiber) return {};

  try {
    if (
      fiber.tag === FunctionComponentTag ||
      fiber.tag === ForwardRefTag ||
      fiber.tag === SimpleMemoComponentTag ||
      fiber.tag === MemoComponentTag
    ) {
      let memoizedState = fiber.memoizedState;
      const state: ComponentState = {};
      const stateNames = getStateNames(fiber);

      let index = 0;
      while (memoizedState) {
        // Only track state hooks with queue
        if (memoizedState.queue) {
          const name = stateNames[index] ?? `state${index}`;
          const value = memoizedState.memoizedState;

          // Preserve the type of the value
          if (Array.isArray(value)) {
            state[name] = [...value];
          } else if (typeof value === 'object' && value !== null) {
            state[name] = { ...value };
          } else {
            state[name] = value;
          }
          index++;
        }
        memoizedState = memoizedState.next;
      }

      return state;
    }
  } catch {
    /* Silently fail */
  }
  return {};
};

const isFiberInTree = (fiber: Fiber, root: Fiber): boolean => {
  return !!traverseFiber(root, (searchFiber) => searchFiber === fiber);
};

export const isCurrentTree = (fiber: Fiber) => {
  let curr: Fiber | null = fiber;
  let rootFiber: Fiber | null = null;

  while (curr) {
    if (
      curr.stateNode &&
      ReactScanInternals.instrumentation?.fiberRoots.has(curr.stateNode)
    ) {
      rootFiber = curr;
      break;
    }
    curr = curr.return;
  }

  if (!rootFiber) {
    return false;
  }

  const fiberRoot = rootFiber.stateNode;
  const currentRootFiber = fiberRoot.current;

  return isFiberInTree(fiber, currentRootFiber);
};

export const getCompositeComponentFromElement = (element: Element) => {
  const associatedFiber = getNearestFiberFromElement(element);

  if (!associatedFiber) return {};
  const currentAssociatedFiber = isCurrentTree(associatedFiber)
    ? associatedFiber
    : (associatedFiber.alternate ?? associatedFiber);
  const stateNode = getFirstStateNode(currentAssociatedFiber);
  if (!stateNode) return {};
  const targetRect = stateNode.getBoundingClientRect(); // causes reflow, be careful
  if (!targetRect) return {};
  const anotherRes = getParentCompositeFiber(currentAssociatedFiber);
  if (!anotherRes) {
    return {};
  }
  let [parentCompositeFiber] = anotherRes;
  parentCompositeFiber =
    (isCurrentTree(parentCompositeFiber)
      ? parentCompositeFiber
      : parentCompositeFiber.alternate) ?? parentCompositeFiber;

  return {
    parentCompositeFiber,
    targetRect,
  };
};

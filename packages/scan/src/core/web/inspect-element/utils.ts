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
  overrideProps:
    | ((fiber: Fiber, path: Array<string>, value: any) => void)
    | null;
  overrideHookState:
    | ((fiber: Fiber, id: string, path: Array<any>, value: any) => void)
    | null;
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
  value: any;
  prevValue?: any;
}

export const getChangedPropsDetailed = (fiber: Fiber): Array<PropChange> => {
  const currentProps = fiber.memoizedProps || {};
  const previousProps = fiber.alternate?.memoizedProps || {};
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

const isDifferent = (a: any, b: any): boolean => {
  // Quick reference check
  if (a === b) return false;

  // For primitives
  return !Object.is(a, b);
};

// Track changes for props and context
const propsChangeCounts = new Map<string, number>();
const lastKnownProps = new Map<string, any>();
const initializedProps = new Set<string>();
const propsValueSequence = new Map<string, Array<any>>();

const contextChangeCounts = new Map<string, number>();
const lastKnownContexts = new Map<string, any>();
const initializedContexts = new Set<string>();
const contextValueSequence = new Map<string, Array<any>>();

export const getChangedProps = (fiber: Fiber): Set<string> => {
  const changes = new Set<string>();
  if (!fiber.alternate) return changes;

  const previousProps = fiber.alternate.memoizedProps || {};
  const currentProps = fiber.memoizedProps || {};

  // Check top-level props
  for (const key in currentProps) {
    if (key === 'children') continue;
    const currentValue = currentProps[key];
    const previousValue = previousProps[key];

    // Handle initialization
    if (!initializedProps.has(key)) {
      initializedProps.add(key);
      lastKnownProps.set(key, currentValue);
      propsValueSequence.set(key, [currentValue]);
      propsChangeCounts.set(key, 0);
      continue;
    }

    if (isDifferent(currentValue, previousValue)) {
      changes.add(key);

      const sequence = propsValueSequence.get(key) ?? [];
      if (!sequence.includes(previousValue)) {
        sequence.push(previousValue);
      }
      if (!sequence.includes(currentValue)) {
        sequence.push(currentValue);
      }

      propsValueSequence.set(key, sequence);
      const changeCount = sequence.length - 1;
      propsChangeCounts.set(key, changeCount);
      lastKnownProps.set(key, currentValue);
    }
  }

  // Check for deleted props
  for (const key in previousProps) {
    if (key === 'children') continue;
    if (!(key in currentProps)) {
      changes.add(key);
    }
  }

  return changes;
};

const STATE_NAME_REGEX = /\[(?<name>\w+),\s*set\w+\]/g;

export const getStateNames = (fiber: Fiber): Array<string> => {
  const componentSource = fiber.type?.toString?.() || '';
  return componentSource ? Array.from(
    componentSource.matchAll(STATE_NAME_REGEX),
    (m: RegExpMatchArray) => m.groups?.name ?? ''
  ) : [];
};

export const getStateFromFiber = (fiber: Fiber | null) => {
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
        if (memoizedState.queue && memoizedState.memoizedState !== undefined) {
          const name = stateNames[index] ?? `state${index}`;

          // Start with current state
          let value = memoizedState.memoizedState;

          // Apply any pending updates
          if (memoizedState.queue.pending) {
            const pending = memoizedState.queue.pending;
            let update = pending.next;

            // Process all updates in the circular queue
            do {
              if (update?.payload) {
                value = typeof update.payload === 'function'
                  ? update.payload(value)
                  : update.payload;
              }
              update = update.next;
            } while (update !== null && update !== pending.next);
          }

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

// Track state change counts and initialization status
const stateChangeCounts = new Map<string, number>();
const lastKnownValues = new Map<string, any>();
const initializedStates = new Set<string>();
const valueSequence = new Map<string, Array<any>>();
const forcedChanges = new Set<string>();
const recentChanges = new Map<string, number>();

// Reset tracking for a specific state key and force change detection
export const resetStateKeyTracking = (key: string, currentValue: any) => {
  // Get existing sequence and count
  const sequence = valueSequence.get(key) ?? [];
  const currentCount = stateChangeCounts.get(key) ?? 0;

  // Add new value to sequence if it's different from the last one
  const lastValue = sequence[sequence.length - 1];
  if (!Object.is(currentValue, lastValue)) {
    sequence.push(currentValue);
    valueSequence.set(key, sequence);
    stateChangeCounts.set(key, currentCount + 1);
  }

  // Update last known value
  lastKnownValues.set(key, currentValue);

  // Mark as forced change
  forcedChanges.add(key);
  recentChanges.set(key, Date.now());
};

export const getChangedState = (fiber: Fiber): Set<string> => {
  const changes = new Set<string>();
  if (!fiber.alternate) return changes;

  const currentState = getStateFromFiber(fiber);
  const previousState = getStateFromFiber(fiber.alternate);
  const now = Date.now();

  // Clean up old recent changes (older than 500ms)
  for (const [key, timestamp] of recentChanges.entries()) {
    if (now - timestamp > 500) {
      recentChanges.delete(key);
    }
  }

  // Compare current state with previous state
  for (const key in currentState) {
    const currentValue = currentState[key];
    const previousValue = previousState[key];
    const lastKnownValue = lastKnownValues.get(key);

    // Handle initialization
    if (!initializedStates.has(key)) {
      initializedStates.add(key);
      lastKnownValues.set(key, currentValue);
      valueSequence.set(key, [currentValue]);
      stateChangeCounts.set(key, 0);
      continue; // Skip counting initial values as changes
    }

    // Check if the value has changed, is a forced change, or is a recent change
    if (!Object.is(currentValue, previousValue) ||
      !Object.is(currentValue, lastKnownValue) ||
      forcedChanges.has(key) ||
      recentChanges.has(key)) {
      changes.add(key);
      forcedChanges.delete(key); // Clear the forced change flag

      // Get the sequence of values for this key
      const sequence = valueSequence.get(key) ?? [];

      // Add both previous and current values if they're new
      if (!sequence.includes(previousValue)) {
        sequence.push(previousValue);
      }
      if (!sequence.includes(currentValue)) {
        sequence.push(currentValue);
      }

      valueSequence.set(key, sequence);

      // Update change count - subtract 1 because first value is initial state
      const changeCount = sequence.length - 1;
      stateChangeCounts.set(key, changeCount);
      lastKnownValues.set(key, currentValue);
    }
  }

  console.log('Changes:', changes);
  console.log('Current state:', currentState);
  console.log('Previous state:', previousState);
  console.log('Last known values:', Object.fromEntries(lastKnownValues));
  console.log('Change counts:', Object.fromEntries(stateChangeCounts));
  console.log('Value sequences:', Object.fromEntries(valueSequence));

  return changes;
};

// Update resetStateTracking to also clear recent changes
export const resetStateTracking = () => {
  // State tracking
  stateChangeCounts.clear();
  lastKnownValues.clear();
  initializedStates.clear();
  valueSequence.clear();
  forcedChanges.clear();
  recentChanges.clear();

  // Props tracking
  propsChangeCounts.clear();
  lastKnownProps.clear();
  initializedProps.clear();
  propsValueSequence.clear();

  // Context tracking
  contextChangeCounts.clear();
  lastKnownContexts.clear();
  initializedContexts.clear();
  contextValueSequence.clear();
};

// Get the count for a specific state
export const getStateChangeCount = (name: string): number => {
  return stateChangeCounts.get(name) ?? 0;
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

interface ContextDependency {
  context: {
    _currentValue: any;
    displayName?: string;
  };
  next: ContextDependency | null;
}

interface ContextValue {
  displayValue: Record<string, unknown>;
  actions?: Record<string, (...args: Array<any>) => unknown>;
  isUserContext?: boolean;
  rawValue?: unknown;
}

interface ContextType {
  displayName?: string;
  _currentValue: unknown;
  Provider?: unknown;
  Consumer?: unknown;
}

const ensureRecord = (value: unknown): Record<string, unknown> => {
  if (value === null || value === undefined) {
    return {};
  }
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return { value };
};

export const getAllFiberContexts = (fiber: Fiber): Map<string, ContextValue> => {
  const contexts = new Map<string, ContextValue>();
  if (!fiber) return contexts;

  const findProviderValue = (contextType: ContextType): {
    value: ContextValue;
    displayName: string;
  } | null => {
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

    return {
      value: {
        displayValue: ensureRecord(contextType._currentValue),
        isUserContext: false,
        rawValue: contextType._currentValue
      },
      displayName: contextType.displayName ?? 'Unnamed'
    };
  };

  const processContext = (contextType: ContextType) => {
    if (contextType && contextType._currentValue !== undefined) {
      if ('Consumer' in contextType && 'Provider' in contextType) {
        const result = findProviderValue(contextType);
        if (result) {
          contexts.set(result.displayName, result.value);
        }
      }
    }
  };

  let currentFiber: Fiber | null = fiber;
  while (currentFiber) {
    if (currentFiber.memoizedState) {
      let memoizedState = currentFiber.memoizedState;
      while (memoizedState) {
        if (memoizedState.queue === null && memoizedState.memoizedState !== undefined) {
          const contextType = memoizedState.dependencies?.context;
          if (contextType) {
            processContext(contextType as ContextType);
          }
        }
        memoizedState = memoizedState.next;
      }
    }

    if (currentFiber.dependencies?.firstContext) {
      let contextItem: ContextDependency | null = currentFiber.dependencies.firstContext;
      while (contextItem !== null) {
        processContext(contextItem.context as ContextType);
        contextItem = contextItem.next;
      }
    }

    currentFiber = currentFiber.return;
  }

  return contexts;
};

export const getChangedContext = (fiber: Fiber): Set<string> => {
  const changes = new Set<string>();
  if (!fiber.alternate) return changes;

  const currentContexts = getAllFiberContexts(fiber);

  currentContexts.forEach((currentValue, contextType) => {
    const contextName = (typeof contextType === 'object' && contextType !== null)
      ? (contextType as any)?.displayName ??
      (contextType as any)?.Provider?.displayName ??
      (contextType as any)?.Consumer?.displayName ??
      (contextType as any)?.type?.name?.replace('Provider', '') ??
      'Unnamed'
      : contextType;

    // Handle initialization
    if (!initializedContexts.has(contextName)) {
      initializedContexts.add(contextName);
      lastKnownContexts.set(contextName, currentValue);
      contextValueSequence.set(contextName, [currentValue]);
      contextChangeCounts.set(contextName, 0);
      return;
    }

    // Find the provider in the fiber tree
    let searchFiber: Fiber | null = fiber;
    let providerFiber: Fiber | null = null;

    while (searchFiber) {
      if (searchFiber.type?.Provider) {
        providerFiber = searchFiber;
        break;
      }
      searchFiber = searchFiber.return;
    }

    // Compare current and alternate values if provider is found
    if (providerFiber && providerFiber.alternate) {
      const currentProviderValue = providerFiber.memoizedProps?.value;
      const alternateValue = providerFiber.alternate.memoizedProps?.value;

      if (!Object.is(currentProviderValue, alternateValue)) {
        changes.add(contextName);

        const sequence = contextValueSequence.get(contextName) ?? [];
        if (!sequence.includes(alternateValue)) {
          sequence.push(alternateValue);
        }
        if (!sequence.includes(currentProviderValue)) {
          sequence.push(currentProviderValue);
        }

        contextValueSequence.set(contextName, sequence);
        const changeCount = sequence.length - 1;
        contextChangeCounts.set(contextName, changeCount);
        lastKnownContexts.set(contextName, currentProviderValue);
      }
    }
  });

  return changes;
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

export const getCurrentProps = (fiber: Fiber) => {
  return fiber.memoizedProps || {};
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
        // Check for both queue and lastRenderedState
        if (memoizedState.queue?.lastRenderedState !== undefined) {
          const name = stateNames[index] ?? `state${index}`;

          // Get the latest rendered state
          const value = memoizedState.queue.lastRenderedState;

          // Preserve the type of the value
          if (Array.isArray(value)) {
            state[name] = [...value];
          } else if (typeof value === 'object' && value !== null) {
            state[name] = { ...value };
          } else {
            state[name] = value;
          }
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

export const getCurrentContext = (fiber: Fiber) => {
  const contexts = getAllFiberContexts(fiber);
  const contextObj: Record<string, any> = {};

  contexts.forEach((value, contextType) => {
    const contextKey = (typeof contextType === 'object' && contextType !== null)
      ? (contextType as any)?.displayName ??
      (contextType as any)?.Provider?.displayName ??
      (contextType as any)?.Consumer?.displayName ??
      'UnnamedContext'
      : contextType;
    contextObj[contextKey] = value.displayValue;
  });

  return contextObj;
};

// Add getters for props and context counts
export const getPropsChangeCount = (name: string): number => {
  return propsChangeCounts.get(name) ?? 0;
};

export const getContextChangeCount = (name: string): number => {
  return contextChangeCounts.get(name) ?? 0;
};

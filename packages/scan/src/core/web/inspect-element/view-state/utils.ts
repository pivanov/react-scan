import {
  FunctionComponentTag,
  ForwardRefTag,
  SimpleMemoComponentTag,
  MemoComponentTag,
} from 'bippy';
import { type Fiber } from 'react-reconciler';
import { type ComponentState } from 'react';

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

// Simple counters for changes
const stateChangeCounts = new Map<string, number>();
const propsChangeCounts = new Map<string, number>();
const contextChangeCounts = new Map<string, number>();
const lastRendered = new Map<string, unknown>();
const pendingStateUpdates = new Map<string, unknown>();

// Reset all tracking
export const resetStateTracking = (): void => {
  stateChangeCounts.clear();
  propsChangeCounts.clear();
  contextChangeCounts.clear();
  lastRendered.clear();
  pendingStateUpdates.clear();
};

// Track state updates directly
export const trackStateUpdate = (name: string, value: unknown): void => {
  const currentValue = pendingStateUpdates.get(name);
  // Only track if the value actually changed
  if (!Object.is(currentValue, value)) {
    pendingStateUpdates.set(name, value);
    const count = (stateChangeCounts.get(name) ?? 0) + 1;
    stateChangeCounts.set(name, count);
  }
};

// Simple change detection for props
export const getChangedProps = (fiber: Fiber): Set<string> => {
  const changes = new Set<string>();
  if (!fiber.alternate) return changes;

  const previousProps = fiber.alternate.memoizedProps ?? {};
  const currentProps = fiber.memoizedProps ?? {};

  // Track primitive changes separately
  let primitiveChangeCount = 0;

  // Get original prop order
  const propsOrder = getPropsOrder(fiber);
  const orderedProps = [...propsOrder, ...Object.keys(currentProps)];
  // Remove duplicates while preserving order
  const uniqueOrderedProps = [...new Set(orderedProps)];

  // Check changed or new props in order
  for (const key of uniqueOrderedProps) {
    if (key === 'children') continue;
    if (!(key in currentProps)) continue;

    const currentValue = currentProps[key];
    const previousValue = previousProps[key];

    // Track direct changes
    if (!Object.is(currentValue, previousValue)) {
      changes.add(key);

      if (typeof currentValue !== 'function') {
        primitiveChangeCount++;
      // Increment count for primitive props normally
        const count = (propsChangeCounts.get(key) ?? 0) + 1;
        propsChangeCounts.set(key, count);
      }
    }
  }

  // If we had primitive changes, increment function props
  if (primitiveChangeCount > 0) {
    for (const key of uniqueOrderedProps) {
      if (key === 'children') continue;
      if (!(key in currentProps)) continue;

      const value = currentProps[key];
      if (typeof value === 'function') {
        changes.add(key);
        const count = (propsChangeCounts.get(key) ?? 0) + primitiveChangeCount;
        propsChangeCounts.set(key, count);
      }
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
  if (!fiber.alternate) {
    // For initial mount, check if any state values are non-default
    let currentState = fiber.memoizedState;
    const stateNames = getStateNames(fiber);
    let index = 0;

    while (currentState) {
      if (currentState.queue) {
        const currentValue = currentState.memoizedState;
        const name = stateNames[index] ?? `state${index}`;

        // Check if the value is different from default values
        const isNonDefault =
          (typeof currentValue === 'string' && currentValue !== '') ||
          (typeof currentValue === 'number' && currentValue !== 0) ||
          (typeof currentValue === 'boolean' && currentValue) ||
          (Array.isArray(currentValue) && currentValue.length > 0) ||
          (typeof currentValue === 'object' && currentValue !== null && Object.keys(currentValue).length > 0);

        if (isNonDefault) {
          changes.add(name);
          const count = (stateChangeCounts.get(name) ?? 0) + 1;
          stateChangeCounts.set(name, count);
        }
        index++;
      }
      currentState = currentState.next;
    }
    return changes;
  }

  let currentState = fiber.memoizedState;
  let previousState = fiber.alternate.memoizedState;
  const stateNames = getStateNames(fiber);

  // Track primitive changes separately
  let primitiveChangeCount = 0;

  // Only track actual state hooks (with queue)
  let index = 0;
  while (currentState && previousState) {
    if (currentState.queue) {
      const currentValue = currentState.memoizedState;
      const previousValue = previousState.memoizedState;
      const name = stateNames[index] ?? `state${index}`;

      // Check for pending updates we tracked
      const hasPendingUpdate = pendingStateUpdates.has(name);
      const pendingValue = pendingStateUpdates.get(name);

      // Get the latest value by applying all updates
      let latestValue = currentValue;
      let hasQueuedChanges = false;

      // Check pending queue
      if (currentState.queue.pending) {
        const pending = currentState.queue.pending;
        let update = pending.next;
        do {
          if (update?.payload) {
            const nextValue = typeof update.payload === 'function'
              ? update.payload(latestValue)
              : update.payload;
            if (!Object.is(latestValue, nextValue)) {
              hasQueuedChanges = true;
              latestValue = nextValue;
            }
          }
          update = update.next;
        } while (update !== pending.next);
      }

      // Track changes if:
      // 1. Value is different from previous render
      // 2. We have a tracked pending update
      // 3. We have queued changes
      if (!Object.is(currentValue, previousValue) ||
        (hasPendingUpdate && !Object.is(pendingValue, currentValue)) ||
        hasQueuedChanges) {
        changes.add(name);

        // If we have a pending update, use that for counting
        if (hasPendingUpdate) {
          const count = (stateChangeCounts.get(name) ?? 0) + 1;
          stateChangeCounts.set(name, count);
          // Clear the pending update after using it
          pendingStateUpdates.delete(name);
        }
        // Otherwise increment count for primitive values
        else if (!(typeof currentValue === 'function' ||
            (typeof currentValue === 'object' && currentValue !== null))) {
          primitiveChangeCount++;
          const count = (stateChangeCounts.get(name) ?? 0) + 1;
          stateChangeCounts.set(name, count);
        }
      }

      // If we had primitive changes, also track non-primitive state values that changed
      if (primitiveChangeCount > 0 &&
        (typeof currentValue === 'function' ||
          (typeof currentValue === 'object' && currentValue !== null)) &&
        !Object.is(currentValue, previousValue)) {
        changes.add(name);
        const count = (stateChangeCounts.get(name) ?? 0) + primitiveChangeCount;
        stateChangeCounts.set(name, count);
      }

      index++;
    }
    currentState = currentState.next;
    previousState = previousState.next;
  }

  // Also check for new state hooks
  while (currentState) {
    if (currentState.queue) {
      const name = stateNames[index] ?? `state${index}`;
      const value = currentState.memoizedState;

      // Only add if the value is non-default
      const isNonDefault =
        (typeof value === 'string' && value !== '') ||
        (typeof value === 'number' && value !== 0) ||
        (typeof value === 'boolean' && value) ||
        (Array.isArray(value) && value.length > 0) ||
        (typeof value === 'object' && value !== null && Object.keys(value).length > 0);

      if (isNonDefault) {
        changes.add(name);
        const count = (stateChangeCounts.get(name) ?? 0) + 1;
        stateChangeCounts.set(name, count);
      }
      index++;
    }
    currentState = currentState.next;
  }

  // Also check for deleted state hooks
  while (previousState) {
    if (previousState.queue) {
      const name = stateNames[index] ?? `state${index}`;
      changes.add(name);
      const count = (stateChangeCounts.get(name) ?? 0) + 1;
      stateChangeCounts.set(name, count);
      index++;
    }
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

  currentContexts.forEach((_currentValue, contextType) => {
    const contextName = (typeof contextType === 'object' && contextType !== null)
      ? (contextType as any)?.displayName ??
      (contextType as any)?.Provider?.displayName ??
      (contextType as any)?.Consumer?.displayName ??
      (contextType as any)?.type?.name?.replace('Provider', '') ??
      'Unnamed'
      : contextType;

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
        contextChangeCounts.set(contextName, (contextChangeCounts.get(contextName) ?? 0) + 1);
      }
    }
  });

  return changes;
};

// Simple getters for change counts
export const getStateChangeCount = (name: string): number => stateChangeCounts.get(name) ?? 0;
export const getPropsChangeCount = (name: string): number => propsChangeCounts.get(name) ?? 0;
export const getContextChangeCount = (name: string): number => contextChangeCounts.get(name) ?? 0;

const STATE_NAME_REGEX = /\[(?<name>\w+),\s*set\w+\]/g;
const PROPS_ORDER_REGEX = /\(\s*{\s*(?<props>[^}]+)\s*}\s*\)/;

export const getStateNames = (fiber: Fiber): Array<string> => {
  const componentSource = fiber.type?.toString?.() || '';
  return componentSource ? Array.from(
    componentSource.matchAll(STATE_NAME_REGEX),
    (m: RegExpMatchArray) => m.groups?.name ?? ''
  ) : [];
};

export const getPropsOrder = (fiber: Fiber): Array<string> => {
  const componentSource = fiber.type?.toString?.() || '';
  const match = componentSource.match(PROPS_ORDER_REGEX);
  if (!match?.groups?.props) return [];

  return match.groups.props
    .split(',')
    .map((prop: string) => prop.trim().split(':')[0].split('=')[0].trim())
    .filter(Boolean);
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

          // Get the latest value by applying all updates
          let value = memoizedState.memoizedState;

          // First check the pending queue
          if (memoizedState.queue.pending) {
            const pending = memoizedState.queue.pending;
            let update = pending.next;

            // Apply all pending updates
            do {
              if (update?.payload) {
                value = typeof update.payload === 'function'
                  ? update.payload(value)
                  : update.payload;
              }
              update = update.next;
            } while (update !== null && update !== pending.next);
          }

          // Then check the base queue (for concurrent updates)
          if (memoizedState.queue.baseQueue) {
            let update = memoizedState.queue.baseQueue;
            let newValue = value;

            do {
              if (update?.payload) {
                newValue = typeof update.payload === 'function'
                  ? update.payload(newValue)
                  : update.payload;
              }
              update = update.next;
            } while (update !== null && update !== memoizedState.queue.baseQueue);

            value = newValue;
          }

          // Finally, check if there's a more recent value in lastRenderedState
          if (memoizedState.queue.lastRenderedState !== undefined &&
            !Object.is(memoizedState.queue.lastRenderedState, value)) {
            value = memoizedState.queue.lastRenderedState;
          }

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

export const getCurrentProps = (fiber: Fiber): Record<string, unknown> => {
  return fiber.memoizedProps ?? {};
};

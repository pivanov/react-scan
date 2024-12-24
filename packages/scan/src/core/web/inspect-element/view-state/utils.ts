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
      const currentValue = currentState.memoizedState;
      const previousValue = previousState.memoizedState;
      const hasPendingUpdates = currentState.queue.pending !== null;

      // Track changes if value is different or there are pending updates
      if (hasPendingUpdates || !Object.is(currentValue, previousValue)) {
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

  // Also check for new or deleted state hooks
  while (currentState) {
    if (currentState.queue) {
      const name = stateNames[index] ?? `state${index}`;
      changes.add(name);
      const count = (stateChangeCounts.get(name) ?? 0) + 1;
      stateChangeCounts.set(name, count);
      index++;
    }
    currentState = currentState.next;
  }

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
  const _previousContexts = getAllFiberContexts(fiber.alternate);

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

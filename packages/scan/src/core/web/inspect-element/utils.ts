import {
  isCompositeFiber,
  isHostFiber,
  FunctionComponentTag,
  ForwardRefTag,
  SimpleMemoComponentTag,
  MemoComponentTag,
  ClassComponentTag,
  traverseFiber,
} from 'bippy';
import { type Fiber } from 'react-reconciler';
import { ReactScanInternals, Store } from '../../index';

interface OverrideMethods {
  overrideProps:
    | ((fiber: Fiber, path: Array<string>, value: any) => void)
    | null;
  overrideHookState:
    | ((fiber: Fiber, id: string, path: Array<any>, value: any) => void)
    | null;
}

export const getFiberFromElement = (element: Element): Fiber | null => {
  if ('__REACT_DEVTOOLS_GLOBAL_HOOK__' in window) {
    const { renderers } = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!renderers) return null;
    for (const [_, renderer] of Array.from(renderers)) {
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
    // @ts-expect-error - Property '_reactRootContainer' does not exist on type 'HTMLElement'
    return element._reactRootContainer?._internalRoot?.current?.child;
  }

  for (const key in element) {
    if (
      key.startsWith('__reactInternalInstance$') ||
      key.startsWith('__reactFiber')
    ) {
      return element[key as keyof Element] as unknown as Fiber;
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

export const getNearestFiberFromElement = (element: Element | null) => {
  if (!element) return null;
  const target: Element | null = element;
  const originalFiber = getFiberFromElement(target);
  if (!originalFiber) {
    return null;
  }
  const res = getParentCompositeFiber(originalFiber);
  if (!res) {
    return null;
  }

  return res[0];
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

export const getChangedProps = (fiber: Fiber): Set<string> => {
  const currentProps = fiber.memoizedProps || {};
  const previousProps = fiber.alternate?.memoizedProps || {};
  const changes = new Set<string>();

  // First check current vs previous props
  for (const key in currentProps) {
    if (key === 'children') continue;

    const currentValue = currentProps[key];
    const prevValue = previousProps[key];

    // Use strict equality for functions to detect new references
    if (typeof currentValue === 'function' || typeof prevValue === 'function') {
      if (currentValue !== prevValue) {
        changes.add(key);
      }
      continue;
    }

    // For other values, use Object.is for proper NaN handling
    if (!Object.is(currentValue, prevValue)) {
      changes.add(key);
    }
  }

  // Also check if any previous props were removed
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

interface MemoizedState {
  memoizedState: unknown;
  queue: unknown;
  next: MemoizedState | null;
}

interface ComponentState {
  [key: string]: unknown;
}

export const getStateFromFiber = (fiber: Fiber | null): ComponentState => {
  if (!fiber) return {};

  if (
    fiber.tag === FunctionComponentTag ||
    fiber.tag === ForwardRefTag ||
    fiber.tag === SimpleMemoComponentTag ||
    fiber.tag === MemoComponentTag
  ) {
    let memoizedState = fiber.memoizedState as MemoizedState | null;
    const state: ComponentState = {};
    const stateNames = getStateNames(fiber);

    let index = 0;
    while (memoizedState) {
      if (memoizedState.queue && memoizedState.memoizedState !== undefined) {
        const name = stateNames[index] ?? `state${index}`;
        state[name] = memoizedState.memoizedState;
      }
      memoizedState = memoizedState.next;
      index++;
    }

    return state;
  } else if (fiber.tag === ClassComponentTag) {
    return fiber.memoizedState || {};
  }

  return {};
};

export const getChangedState = (fiber: Fiber): Set<string> => {
  const changes = new Set<string>();

  if (fiber.tag === FunctionComponentTag ||
    fiber.tag === SimpleMemoComponentTag ||
    fiber.tag === MemoComponentTag) {
    if (!fiber.memoizedState) return changes;

    let memoizedState = fiber.memoizedState as MemoizedState | null;
    let previousState = fiber.alternate?.memoizedState as MemoizedState | null;
    let index = 0;

    const stateNames = getStateNames(fiber);

    while (memoizedState && previousState) {
      if (memoizedState.queue && memoizedState.memoizedState !== undefined) {
        const name = stateNames[index] ?? `state${index}`;
        const currentValue = memoizedState.memoizedState;
        const prevValue = previousState.memoizedState;

        // eslint-disable-next-line no-console
        console.log(`State Check [${name}]:`, {
          currentValue,
          prevValue,
          isArray: Array.isArray(currentValue),
          currentLength: Array.isArray(currentValue) ? currentValue.length : null,
          prevLength: Array.isArray(prevValue) ? prevValue.length : null,
          isSameReference: currentValue === prevValue,
          isObjectIs: Object.is(currentValue, prevValue)
        });

        // Only add to changes if values are actually different
        if (!Object.is(currentValue, prevValue)) {
          changes.add(name);
        }
        index++;
      }
      memoizedState = memoizedState.next;
      previousState = previousState.next;
    }
  } else if (fiber.tag === ClassComponentTag) {
    if (!fiber.memoizedState) return changes;

    const currentState = fiber.memoizedState;
    const previousState = fiber.alternate?.memoizedState;

    if (currentState && previousState) {
      for (const key in currentState) {
        const currentValue = currentState[key];
        const prevValue = previousState[key];

        if (!Object.is(currentValue, prevValue)) {
          changes.add(key);
        }
      }
    }
  }

  return changes;
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
  const _previousContexts = getAllFiberContexts(fiber.alternate);

  currentContexts.forEach((currentValue, contextType) => {
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
      // Get the react-dom renderer (bundleType: 1)
      for (const [_, renderer] of Array.from(renderers)) {
        try {
          // @ts-expect-error - bundleType is not typed
          if (renderer.bundleType === 1 && renderer.rendererPackageName === 'react-dom') {
          // @ts-expect-error - renderer methods are not typed
            overrideProps = renderer.overrideProps;
            // @ts-expect-error - renderer methods are not typed
            overrideHookState = renderer.overrideHookState;
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

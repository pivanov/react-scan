import type { Fiber } from 'bippy';
import { Store } from '~core/index';
import { findComponentDOMNode } from '~web/components/inspector/utils';
import { readLocalStorage } from './helpers';

export interface FiberMetadata {
  componentName: string;
  parent: string;
  position: number;
  sibling: string | null;
  path: string;
  propKeys: string[];
}

const metadata = readLocalStorage<FiberMetadata>('react-scann-pinned');

export const getFiberMetadata = (fiber: Fiber): FiberMetadata | null => {
  if (!fiber || !fiber.elementType) return null;

  const componentName = fiber.elementType.name || 'UnknownComponent';
  const position = fiber.index !== undefined ? fiber.index : -1;
  const sibling = fiber.sibling?.elementType?.name || null;

  let parentFiber = fiber.return;
  let parent = 'Root';

  while (parentFiber) {
    const parentName = parentFiber.elementType?.name;

    if (typeof parentName === 'string' && parentName.trim().length > 0) {
      parent = parentName;
      break;
    }

    parentFiber = parentFiber.return;
  }

  const pathSegments: string[] = [];
  let currentFiber: Fiber | null = fiber;

  while (currentFiber) {
    if (currentFiber.elementType?.name) {
      const index =
        currentFiber.index !== undefined ? `[${currentFiber.index}]` : '';
      pathSegments.unshift(`${currentFiber.elementType.name}${index}`);
    }
    currentFiber = currentFiber.return ?? null;
  }

  const path = pathSegments.join('::');

  const propKeys = fiber.pendingProps
    ? Object.keys(fiber.pendingProps).filter((key) => key !== 'children')
    : [];

  return { componentName, parent, position, sibling, path, propKeys };
};

const reconstructPath = (fiber: Fiber): string => {
  const pathSegments: string[] = [];
  let currentFiber = fiber;

  while (currentFiber) {
    if (currentFiber.elementType?.name) {
      const index =
        currentFiber.index !== undefined ? `[${currentFiber.index}]` : '';
      pathSegments.unshift(`${currentFiber.elementType.name}${index}`);
    }
    const nextFiber = currentFiber.return;
    if (!nextFiber) break;
    currentFiber = nextFiber;
  }

  return pathSegments.join('::');
};

const checkFiberMatch = (fiber: Fiber | undefined): boolean => {
  if (!fiber || !fiber.elementType || !metadata?.componentName) return false;

  if (fiber.elementType.name !== metadata.componentName) return false;

  let currentParentFiber = fiber.return;
  let parent = '';

  while (currentParentFiber) {
    if (currentParentFiber.elementType?.name) {
      parent = currentParentFiber.elementType.name;
      break;
    }
    currentParentFiber = currentParentFiber.return;
  }

  if (parent !== metadata.parent) return false;
  if (fiber.index !== metadata.position) return false;

  const fiberPath = reconstructPath(fiber);
  return fiberPath === metadata.path;
};

const fiberQueue: Fiber[] = [];
let isProcessing = false;

const processFiberQueue = (): void => {
  if (isProcessing || fiberQueue.length === 0) return;
  isProcessing = true;

  requestIdleCallback(() => {
    while (fiberQueue.length > 0) {
      const fiber = fiberQueue.shift();
      if (fiber && checkFiberMatch(fiber)) {
        // biome-ignore lint/suspicious/noConsole: Intended debug output
        console.log('🎯 Pinned component found!', fiber);
        isProcessing = false;

        const componentElement = findComponentDOMNode(fiber);

        if (!componentElement) return;

        Store.inspectState.value = {
          kind: 'focused',
          focusedDomElement: componentElement,
          fiber,
        };
        return;
      }
    }
    isProcessing = false;
  });
};

export const enqueueFiber = (fiber: Fiber) => {
  if (metadata === null || metadata.componentName !== fiber.elementType?.name) {
    return;
  }

  fiberQueue.push(fiber);
  if (!isProcessing) processFiberQueue();
};

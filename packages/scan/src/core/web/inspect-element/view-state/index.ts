import type { Fiber } from 'react-reconciler';
import { createHTMLTemplate } from '@web-utils/html-template';
import { Store } from 'src/core';
import { getOverrideMethods } from '@web-inspect-element/utils';
import {
  getChangedProps,
  getChangedState,
  getChangedContext,
  getStateNames,
  getCurrentContext,
  getCurrentProps,
  getCurrentState,
  resetStateTracking,
  getStateChangeCount,
  getPropsChangeCount,
  getContextChangeCount,
  getPropsOrder,
} from './utils';

// Types and Interfaces
interface PropertyElementOptions {
  componentName: string;
  didRender: boolean;
  propsContainer: HTMLDivElement;
  fiber: Fiber;
  key: string;
  value: any;
  section?: string;
  level?: number;
  changedKeys?: Set<string>;
  parentPath?: string;
  objectPathMap?: WeakMap<object, Set<string>>;
  hasCumulativeChanges?: boolean;
}

export type CleanupFunction = () => void;
export type PositionCallback = (element: HTMLElement) => void;

// Constants
const EXPANDED_PATHS = new Set<string>();
const fadeOutTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
const activeOverlays = new Set<HTMLElement>();
let lastInspectedFiber: Fiber | null = null;
let changedAtInterval: ReturnType<typeof setInterval> | null = null;

// State Maps
export const changedAt = new Map<string, number>();
const lastRendered = new Map<string, unknown>();

// HTML Templates
const templates = {
  whatChangedSection: createHTMLTemplate<HTMLDetailsElement>(
    `<details class="react-scan-what-changed" style="background-color:#b8860b;color:#ffff00;padding:5px">
      <summary class="font-bold">What changed?</summary>
    </details>`,
    false
  ),

  changeList: createHTMLTemplate<HTMLUListElement>(
    '<ul style="list-style-type:disc;padding-left:20px"></ul>',
    false
  ),

  propertyContainer: createHTMLTemplate<HTMLDivElement>(
    '<div class="react-scan-property">',
    false
  ),

  previewLine: createHTMLTemplate<HTMLDivElement>(
    '<div class="react-scan-preview-line">',
    false
  ),

  arrow: createHTMLTemplate<HTMLSpanElement>(
    '<span class="react-scan-arrow">',
    false
  ),

  propertyContent: createHTMLTemplate<HTMLDivElement>(
    '<div class="react-scan-property-content">',
    false
  ),

  nestedObject: createHTMLTemplate<HTMLDivElement>(
    '<div class="react-scan-nested-object">',
    false
  ),

  inspector: createHTMLTemplate<HTMLDivElement>(
    '<div class="react-scan-inspector">',
    false
  ),

  content: createHTMLTemplate<HTMLDivElement>(
    '<div class="react-scan-content">',
    false
  ),

  header: createHTMLTemplate<HTMLDivElement>(
    '<div>',
    false
  ),

  flashOverlay: createHTMLTemplate<HTMLDivElement>(
    '<div class="react-scan-flash-overlay">',
    false
  ),

  listItem: createHTMLTemplate<HTMLLIElement>(
    '<li>',
    false
  ),

  input: createHTMLTemplate<HTMLInputElement>(
    '<input type="text" class="react-scan-input">',
    false
  ),

  section: createHTMLTemplate<HTMLDivElement>(
    '<div class="react-scan-section">',
    false
  )
};

export const renderPropsAndState = (didRender: boolean, fiber: Fiber) => {
  const propContainer = Store.inspectState.value.propContainer;
  if (!propContainer) return;

  const componentName = fiber.type?.displayName || fiber.type?.name || 'Unknown';

  // Reset tracking only when switching to a different component type
  if (lastInspectedFiber?.type !== fiber.type) {
    resetStateTracking();
  }
  lastInspectedFiber = fiber;

  // Get current changes for yellow box
  const changedProps = getChangedProps(fiber);
  const changedState = getChangedState(fiber);
  const changedContext = getChangedContext(fiber);

  console.log('@@@ changedProps', changedProps);
  // console.log('@@@ changedState', changedState);
  // console.log('@@@ changedContext', changedContext);

  propContainer.innerHTML = '';

  // Create what changed section (yellow box)
  const whatChangedSection = templates.whatChangedSection();
  whatChangedSection.open = Store.wasDetailsOpen.value;

  let hasAnyChanges = false;

  // Show state changes in yellow section
  const stateHeader = templates.header();
  stateHeader.textContent = 'State:';
  const stateList = templates.changeList();
  let hasStateChanges = false;

  changedState.forEach(key => {
    const count = getStateChangeCount(key);
    if (count > 0) {
      hasStateChanges = true;
      hasAnyChanges = true;
      const li = templates.listItem();
      li.textContent = `${key} ×${count}`;
      stateList.appendChild(li);
    }
  });

  if (hasStateChanges) {
    whatChangedSection.appendChild(stateHeader);
    whatChangedSection.appendChild(stateList);
  }

  // Show props changes in yellow section
  const propsHeader = templates.header();
  propsHeader.textContent = 'Props:';
  const propsList = templates.changeList();
  let hasPropsChanges = false;

  // Get props in original component order
  const propsOrder = getPropsOrder(fiber);
  const orderedProps = [...propsOrder, ...Array.from(changedProps)];
  // Remove duplicates while preserving order
  const uniqueOrderedProps = [...new Set(orderedProps)];

  // Display props in order
  uniqueOrderedProps.forEach(key => {
    if (!changedProps.has(key)) return;
    const count = getPropsChangeCount(key);
    if (count > 0) {
      hasPropsChanges = true;
      hasAnyChanges = true;
      const li = templates.listItem();
      li.textContent = `${key} ×${count}`;
      propsList.appendChild(li);
    }
  });

  if (hasPropsChanges) {
    whatChangedSection.appendChild(propsHeader);
    whatChangedSection.appendChild(propsList);
  }

  // Show context changes in yellow section
  const contextHeader = templates.header();
  contextHeader.textContent = 'Context:';
  const contextList = templates.changeList();
  let hasContextChanges = false;

  // Track both current changes and accumulated changes
  changedContext.forEach(key => {
    const count = getContextChangeCount(key);
    if (count > 0) {
      hasContextChanges = true;
      hasAnyChanges = true;
      const li = templates.listItem();
      li.textContent = `${key.replace('context.', '')} ×${count}`;
      contextList.appendChild(li);
    }
  });

  if (hasContextChanges) {
    whatChangedSection.appendChild(contextHeader);
    whatChangedSection.appendChild(contextList);
  }

  // Add back the toggle listener
  whatChangedSection.addEventListener('toggle', () => {
    Store.wasDetailsOpen.value = whatChangedSection.open;
  });

  // Only show the yellow section if there were changes
  if (hasAnyChanges) {
    propContainer.appendChild(whatChangedSection);
  }

  // Create inspector section
  const inspector = templates.inspector();
  const content = templates.content();
  const sections: Array<{ element: HTMLElement; hasChanges: boolean }> = [];

  // Props section - use getCurrentProps
  const currentProps = getCurrentProps(fiber);
  if (Object.values(currentProps).length) {
    tryOrElse(() => {
      sections.push({
        element: renderSection(
          componentName,
          didRender,
          fiber,
          propContainer,
          'Props',
          currentProps,
          changedProps,
        ),
        hasChanges: changedProps.size > 0,
      });
    }, null);
  }

  // Context section - use getCurrentContext
  const currentContext = getCurrentContext(fiber);
  if (Object.keys(currentContext).length) {
    tryOrElse(() => {
      sections.push({
        element: renderSection(
          componentName,
          didRender,
          fiber,
          propContainer,
          'Context',
          currentContext,
          changedContext,
        ),
        hasChanges: changedContext.size > 0,
      });
    }, null);
  }

  // State section - use getCurrentState
  const currentState = getCurrentState(fiber);
  if (Object.values(currentState).length > 0) {
    tryOrElse(() => {
      // Ensure state is treated as a record
      const stateObj: Record<string, unknown> = Array.isArray(currentState)
        ? Object.fromEntries(
          (currentState as Array<unknown>).map((val, idx) => [idx.toString(), val])
        )
        : currentState;

      sections.push({
        element: renderSection(
          componentName,
          didRender,
          fiber,
          propContainer,
          'State',
          stateObj,
          changedState,
        ),
        hasChanges: changedState.size > 0,
      });
    }, null);
  }

  sections.forEach((section) => content.appendChild(section.element));
  inspector.appendChild(content);
  propContainer.appendChild(inspector);
};

export const replayComponent = async (fiber: any) => {
  try {
    const { overrideProps, overrideHookState } = getOverrideMethods();
    if (!overrideProps || !overrideHookState || !fiber) return;

    const currentProps = fiber.memoizedProps || {};

    try {
      Object.keys(currentProps).forEach((key) => {
        overrideProps(fiber, [key], currentProps[key]);
      });
    } catch (e) {
      /**/
    }

    try {
      const state = getCurrentState(fiber) || {};
      Object.keys(state).forEach((key) => {
        overrideHookState(fiber, key, [], state[key]);
      });
    } catch (e) {
      /**/
    }

    try {
      let child = fiber.child;
      while (child) {
        await replayComponent(child);
        child = child.sibling;
      }
    } catch (e) {
      /**/
    }
  } catch (e) {
    /**/
  }
};

// Utility Functions
const tryOrElse = <T, E>(cb: () => T, val: E) => {
  try {
    return cb();
  } catch (e) {
    return val;
  }
};

const isPromise = (value: any): value is Promise<unknown> => {
  return value && (value instanceof Promise || (typeof value === 'object' && 'then' in value));
};

const getPath = (
  componentName: string,
  section: string,
  parentPath: string,
  key: string,
): string => {
  return parentPath
    ? `${componentName}.${parentPath}.${key}`
    : `${componentName}.${section}.${key}`;
};

const isEditableValue = (value: unknown): boolean => {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean';
};

export const getValueClassName = (value: unknown): string => {
  if (Array.isArray(value)) return 'react-scan-array';
  if (value === null || value === undefined) return 'react-scan-null';
  switch (typeof value) {
    case 'string': return 'react-scan-string';
    case 'number': return 'react-scan-number';
    case 'boolean': return 'react-scan-boolean';
    case 'object': return 'react-scan-object-key';
    default: return '';
  }
};

export const getValuePreview = (value: unknown): string => {
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  switch (typeof value) {
    case 'string':
      // Check if the string is already escaped
      if (value.includes('&quot;') || value.includes('&#39;') ||
        value.includes('&lt;') || value.includes('&gt;') ||
        value.includes('&amp;')) {
        return `"${value}"`;
      }
      // If not escaped, do the escaping
      return `"${value.replace(/[<>&"'\\\n\r\t]/g, (char) => {
        switch (char) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case '"': return '&quot;';
          case "'": return '&#39;';
          case '\\': return '\\\\';
          case '\n': return '\\n';
          case '\r': return '\\r';
          case '\t': return '\\t';
          default: return char;
        }
      })}"`;
    case 'number': return value.toString();
    case 'boolean': return value.toString();
    case 'object': {
      if (value instanceof Promise) return 'Promise';
      const keys = Object.keys(value);
      if (keys.length <= 3) return `{${keys.join(', ')}}`;
      return `{${keys.slice(0, 8).join(', ')}, ...}`;
    }
    default: return typeof value;
  }
};

const renderSection = (
  componentName: string,
  didRender: boolean,
  fiber: Fiber,
  propContainer: HTMLDivElement,
  title: string,
  data: Record<string, any>,
  changedKeys: Set<string>,
): HTMLElement => {
  const section = templates.section();
  section.dataset.section = title;

  // Get ordered entries based on section type
  let orderedEntries: Array<[string, any]> = [];
  if (title.toLowerCase() === 'props') {
    // Get props in original component order
    const propsOrder = getPropsOrder(fiber);
    const orderedProps = [...propsOrder, ...Object.keys(data)];
    // Remove duplicates while preserving order
    const uniqueOrderedProps = [...new Set(orderedProps)];
    // Create entries in order
    orderedEntries = uniqueOrderedProps
      .filter(key => key in data)
      .map(key => [key, data[key]]);
  } else {
    orderedEntries = Object.entries(data);
  }

  orderedEntries.forEach(([key, value]) => {
    const el = createPropertyElement({
      componentName,
      didRender,
      propsContainer: propContainer,
      fiber,
      key,
      value,
      section: title.toLowerCase(),
      level: 0,
      changedKeys,
      parentPath: '',
      objectPathMap: new WeakMap(),
      hasCumulativeChanges: true
    });

    if (!el) return;
    section.appendChild(el);
  });

  return section;
};

export const createPropertyElement = ({
  componentName,
  didRender,
  propsContainer,
  fiber,
  key,
  value,
  section = '',
  level = 0,
  changedKeys = new Set<string>(),
  parentPath = '',
  objectPathMap = new WeakMap<object, Set<string>>(),
  hasCumulativeChanges = false,
}: PropertyElementOptions): HTMLElement | null => {
  try {
    if (!changedAtInterval) {
      changedAtInterval = setInterval(() => {
        changedAt.forEach((value, key) => {
          if (Date.now() - value > 450) {
            changedAt.delete(key);
          }
        });
      }, 200);
    }

    const container = templates.propertyContainer();

    const isExpandable =
      !isPromise(value) &&
      ((Array.isArray(value) && value.length > 0) ||
        (typeof value === 'object' &&
          value !== null &&
          Object.keys(value).length > 0));

    const currentPath = getPath(componentName, section, parentPath, key);
    const prevValue = lastRendered.get(currentPath);
    const isChanged = prevValue !== undefined && prevValue !== value;

    const shouldShowChange =
      isChanged || changedKeys.has(key) || hasCumulativeChanges;

    // Only show warning sign at the first level (level === 0)
    const isBadRender = level === 0 && shouldShowChange;

    lastRendered.set(currentPath, value);

    if (shouldShowChange) {
      changedAt.set(currentPath, Date.now());
      createAndHandleFlashOverlay(container);

      // Also flash parent container if this is a nested value
      if (level > 0 && container.parentElement) {
        const parentContainer = container.closest('.react-scan-property')?.parentElement?.closest('.react-scan-property');
        if (parentContainer instanceof HTMLElement) {
          createAndHandleFlashOverlay(parentContainer);
        }
      }
    }

    if (isExpandable) {
      const isExpanded = EXPANDED_PATHS.has(currentPath);

      if (typeof value === 'object' && value !== null) {
        let paths = objectPathMap.get(value);
        if (!paths) {
          paths = new Set();
          objectPathMap.set(value, paths);
        }
        if (paths.has(currentPath)) {
          return createCircularReferenceElement(key);
        }
        paths.add(currentPath);
      }

      container.classList.add('react-scan-expandable');
      if (isExpanded) {
        container.classList.add('react-scan-expanded');
      }

      const arrow = templates.arrow();
      container.appendChild(arrow);

      const contentWrapper = templates.propertyContent();

      const preview = templates.previewLine();
      preview.dataset.key = key;
      preview.dataset.section = section;

      preview.innerHTML = `
        ${isBadRender ? '<span class="react-scan-warning">⚠️</span>' : ''}
        <span class="react-scan-key">${key}:&nbsp;</span><span class="${getValueClassName(
        value,
      )} react-scan-value truncate">${getValuePreview(value)}</span>
      `;

      const content = templates.nestedObject();
      content.className = isExpanded
        ? 'react-scan-nested-object'
        : 'react-scan-nested-object react-scan-hidden';

      contentWrapper.appendChild(preview);
      contentWrapper.appendChild(content);
      container.appendChild(contentWrapper);

      if (isExpanded) {
        if (Array.isArray(value)) {
          value.forEach((item, index) => {
            const el = createPropertyElement({
              componentName,
              didRender,
              propsContainer,
              fiber,
              key: index.toString(),
              value: item,
              section,
              level: level + 1,
              changedKeys: new Set(),
              parentPath: currentPath,
              objectPathMap: new WeakMap(),
              hasCumulativeChanges: false
            });
            if (!el) return;
            content.appendChild(el);
          });
        } else {
          Object.entries(value).forEach(([k, v]) => {
            const el = createPropertyElement({
              componentName,
              didRender,
              propsContainer,
              fiber,
              key: k,
              value: v,
              section,
              level: level + 1,
              changedKeys: new Set(),
              parentPath: currentPath,
              objectPathMap: new WeakMap(),
              hasCumulativeChanges: false
            });
            if (!el) return;
            content.appendChild(el);
          });
        }
      }

      arrow.addEventListener('click', (e) => {
        e.stopPropagation();

        const isExpanding = !container.classList.contains('react-scan-expanded');

        if (isExpanding) {
          EXPANDED_PATHS.add(currentPath);
          container.classList.add('react-scan-expanded');
          content.classList.remove('react-scan-hidden');

          if (!content.hasChildNodes()) {
            if (Array.isArray(value)) {
              value.forEach((item, index) => {
                const el = createPropertyElement({
                  componentName,
                  didRender,
                  propsContainer,
                  fiber,
                  key: index.toString(),
                  value: item,
                  section,
                  level: level + 1,
                  changedKeys: new Set(),
                  parentPath: currentPath,
                  objectPathMap: new WeakMap(),
                  hasCumulativeChanges: false
                });
                if (!el) return;
                content.appendChild(el);
              });
            } else {
              Object.entries(value).forEach(([k, v]) => {
                const el = createPropertyElement({
                  componentName,
                  didRender,
                  propsContainer,
                  fiber,
                  key: k,
                  value: v,
                  section,
                  level: level + 1,
                  changedKeys: new Set(),
                  parentPath: currentPath,
                  objectPathMap: new WeakMap(),
                  hasCumulativeChanges: false
                });
                if (!el) return;
                content.appendChild(el);
              });
            }
          }
        } else {
          EXPANDED_PATHS.delete(currentPath);
          container.classList.remove('react-scan-expanded');
          content.classList.add('react-scan-hidden');
        }
      });
    } else {
      const preview = templates.previewLine();
      preview.dataset.key = key;
      preview.dataset.section = section;
      preview.innerHTML = `
        ${isBadRender ? '<span class="react-scan-warning">⚠️</span>' : ''}
        <span class="react-scan-key">${key}:&nbsp;</span><span class="${getValueClassName(
        value,
      )} react-scan-value truncate">${getValuePreview(value)}</span>
      `;
      container.appendChild(preview);

      if (section === 'props' || section === 'state') {
        const valueElement = preview.querySelector('.react-scan-value');
        const { overrideProps, overrideHookState } = getOverrideMethods();
        const canEdit = section === 'props' ? !!overrideProps : !!overrideHookState;

        if (valueElement && canEdit && isEditableValue(value)) {
          valueElement.classList.add('react-scan-editable');
          valueElement.addEventListener('click', (e) => {
            e.stopPropagation();

            const input = templates.input();
            input.value = typeof value === 'string' ?
              value.replace(/^"(?:.*)"$/, '$1')
                .replace(/&quot;/g, '"')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&#39;/g, "'")
              : value.toString();

            const updateValue = () => {
              try {
                const newValue = input.value;
                const convertedValue =
                  typeof value === 'number' ? Number(newValue) :
                    typeof value === 'boolean' ? newValue === 'true' :
                      newValue;

                // Only proceed if the value actually changed
                if (Object.is(value, convertedValue)) {
                  if (input.parentNode) {
                    input.replaceWith(valueElement);
                  }
                  return;
                }

                value = convertedValue;

                // First apply the state/prop update
                if (section === 'props' && overrideProps) {
                  if (parentPath) {
                    const parts = parentPath.split('.');
                    // Get only the actual prop path parts (after 'props')
                    const path = parts.filter(part => part !== 'props' && part !== componentName);
                    path.push(key);
                    overrideProps(fiber, path, convertedValue);
                  } else {
                    overrideProps(fiber, [key], convertedValue);
                  }
                }

                if (section === 'state' && overrideHookState) {
                  // Handle primitive state values (no path) differently
                  if (!parentPath) {
                    const stateNames = getStateNames(fiber);
                    const namedStateIndex = stateNames.indexOf(key);
                    const hookId = namedStateIndex !== -1 ?
                      namedStateIndex.toString() :
                      '0';

                    // Update the primitive state value directly
                    overrideHookState(fiber, hookId, [], convertedValue);
                  } else {
                    // For nested state updates
                    const fullPathParts = parentPath.split('.');
                    const stateIndex = fullPathParts.indexOf('state');
                    if (stateIndex === -1) return;

                    const statePath = fullPathParts.slice(stateIndex + 1);
                    const baseStateKey = statePath[0];

                    const stateNames = getStateNames(fiber);
                    const namedStateIndex = stateNames.indexOf(baseStateKey);
                    const hookId = namedStateIndex !== -1 ?
                      namedStateIndex.toString() :
                      '0';

                    const nestedPath = statePath.slice(1).map(part => {
                      return /^\d+$/.test(part) ? parseInt(part, 10) : part;
                    });

                    nestedPath.push(key);
                    overrideHookState(fiber, hookId, nestedPath, convertedValue);
                  }
                }

                // Trigger flash overlay for the edited value and its parent
                const currentPath = getPath(componentName, section, parentPath, key);
                changedAt.set(currentPath, Date.now());
                createAndHandleFlashOverlay(container);

                if (parentPath) {
                  const parentParts = parentPath.split('.');
                  const parentKey = parentParts[parentParts.length - 1];
                  const grandParentPath = parentParts.slice(0, -1).join('.');
                  const parentCurrentPath = getPath(componentName, section, grandParentPath, parentKey);
                  changedAt.set(parentCurrentPath, Date.now());

                  // Find and flash the parent container
                  const parentContainer = container.closest('.react-scan-property')?.parentElement?.closest('.react-scan-property');
                  if (parentContainer instanceof HTMLElement) {
                    createAndHandleFlashOverlay(parentContainer);
                  }
                }

                // Re-render the yellow box to show the changes
                // renderPropsAndState(true, fiber);

              } catch (error) {
                if (input.parentNode) {
                  input.replaceWith(valueElement);
                }
              }
            };

            input.addEventListener('keydown', (e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                updateValue();
              } else if (e.key === 'Escape') {
                if (input.parentNode) {
                  input.replaceWith(valueElement);
                }
              }
            });

            // Add blur handler to update when focus is lost
            input.addEventListener('blur', () => {
              updateValue();
            });

            valueElement.replaceWith(input);
            input.focus();
          });
        }
      }
    }

    return container;
  } catch {
    return null;
  }
};

const createCircularReferenceElement = (key: string): HTMLElement => {
  const container = templates.propertyContainer();

  const preview = templates.previewLine();
  preview.innerHTML = `
    <span class="react-scan-key">${key}:&nbsp;</span><span class="react-scan-circular">[Circular Reference]</span>
  `;
  container.appendChild(preview);
  return container;
};

// Overlay Management
const cleanupFlashOverlay = (overlay: HTMLElement) => {
  const timerId = fadeOutTimers.get(overlay);
  if (timerId !== undefined) {
    clearTimeout(timerId);
    fadeOutTimers.delete(overlay);
  }
  activeOverlays.delete(overlay);
  if (overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
};

const createAndHandleFlashOverlay = (container: HTMLElement) => {
  // Use a single query selector call and cache the result
  const existingOverlay = container.querySelector('.react-scan-flash-overlay');

  // Reuse existing overlay if possible
  const flashOverlay = existingOverlay instanceof HTMLElement ? existingOverlay : (() => {
    const newOverlay = templates.flashOverlay();
    container.appendChild(newOverlay);
    activeOverlays.add(newOverlay);
    return newOverlay;
  })();

  // Batch style updates using requestAnimationFrame
  requestAnimationFrame(() => {
    // Reset the overlay state
    flashOverlay.style.cssText = `
      transition: none;
      opacity: 0.9;
    `;

    // Clear any existing timer
    const existingTimer = fadeOutTimers.get(flashOverlay);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
      fadeOutTimers.delete(flashOverlay);
    }

    // Set new timer with cleanup
    const timerId = setTimeout(() => {
      // Use opacity transition for smooth fade out
      flashOverlay.style.transition = 'opacity 150ms ease-out';
      flashOverlay.style.opacity = '0';

      // Remove overlay after transition
      const cleanupTimer = setTimeout(() => {
        cleanupFlashOverlay(flashOverlay);
        fadeOutTimers.delete(flashOverlay);
      }, 150);

      // Store the cleanup timer
      fadeOutTimers.set(flashOverlay, cleanupTimer);
    }, 300);

    fadeOutTimers.set(flashOverlay, timerId);
  });
};

export const cleanup = () => {
  // Clear all expanded paths
  EXPANDED_PATHS.clear();

  // Clean up all active overlays and ensure proper garbage collection
  activeOverlays.forEach(cleanupFlashOverlay);
  activeOverlays.clear();

  // Clear interval if it exists
  if (changedAtInterval !== null) {
    clearInterval(changedAtInterval);
    changedAtInterval = null;
  }

  // Clear all timers from active overlays
  activeOverlays.forEach((overlay) => {
    const timer = fadeOutTimers.get(overlay);
    if (timer) {
      clearTimeout(timer);
      fadeOutTimers.delete(overlay);
    }
  });

  // Clear tracking maps
  changedAt.clear();
  lastRendered.clear();

  // Reset last inspected fiber
  lastInspectedFiber = null;
};

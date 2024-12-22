import { type Fiber } from 'react-reconciler';
import { createHTMLTemplate } from '@web-utils/html-template';
import { fastSerialize } from '../../instrumentation';
import { Store } from '../../index';
import {
  getChangedProps,
  getChangedState,
  getChangedContext,
  getStateFromFiber,
  getOverrideMethods,
  getAllFiberContexts,
  getStateNames,
} from './utils';

const EXPANDED_PATHS = new Set<string>();
const fadeOutTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

export const cumulativeChanges = {
  props: new Map<string, number>(),
  state: new Map<string, number>(),
  context: new Map<string, number>(),
};

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
  const componentKey = String(fiber.alternate?._debugID ?? fiber._debugID ?? '');

  // Get current changes
  const changedProps = new Set(getChangedProps(fiber));
  const changedState = new Set(getChangedState(fiber));
  const changedContext = new Set(getChangedContext(fiber));

  // Get render data from Store
  const reportData = Store.reportData.get(fiber);

  propContainer.innerHTML = '';

  // Create what changed section using template
  const whatChangedSection = templates.whatChangedSection();
  whatChangedSection.open = Store.wasDetailsOpen.value;

  let hasAnyChanges = false;

  // Show all props that changed
  if (changedProps.size > 0) {
    const propsHeader = templates.header();
    propsHeader.textContent = 'Props:';
    const propsList = templates.changeList();

    let hasVisibleProps = false;
    changedProps.forEach(key => {
      const count = reportData?.count || 0;

      if (count > 0) {
        hasVisibleProps = true;
        hasAnyChanges = true;
        const li = templates.listItem();
        li.textContent = `${key} ×${count}`;
        propsList.appendChild(li);
      }
    });

    if (hasVisibleProps) {
      whatChangedSection.appendChild(propsHeader);
      whatChangedSection.appendChild(propsList);
    }
  }

  // Show all state that changed
  if (changedState.size > 0) {
    const stateHeader = templates.header();
    stateHeader.textContent = 'State:';
    const stateList = templates.changeList();

    let hasVisibleState = false;
    changedState.forEach(key => {
      const fullKey = `${componentKey}:${key}`;
      const count = cumulativeChanges.state.get(fullKey) ?? 0;

      if (count > 0) {
        hasVisibleState = true;
        hasAnyChanges = true;
        const li = templates.listItem();
        li.textContent = `${key} ×${count}`;
        stateList.appendChild(li);
      }
    });

    if (hasVisibleState) {
      whatChangedSection.appendChild(stateHeader);
      whatChangedSection.appendChild(stateList);
    }
  }

  // Show context that changed
  if (changedContext.size > 0) {
    const contextHeader = templates.header();
    contextHeader.textContent = 'Context:';
    const contextList = templates.changeList();

    let hasVisibleContext = false;
    changedContext.forEach(key => {
      if (key.startsWith('context.')) {
        const fullKey = `${componentKey}:${key}`;
        const count = cumulativeChanges.context.get(fullKey) ?? 0;

        if (count > 0) {
          hasVisibleContext = true;
          hasAnyChanges = true;
          const li = templates.listItem();
          li.textContent = `${key.replace('context.', '')} ×${count}`;
          contextList.appendChild(li);
        }
      } else {
        const fullKey = `${componentKey}:${key}`;
        const count = cumulativeChanges.context.get(fullKey) ?? 0;

        if (count > 0) {
          hasVisibleContext = true;
          hasAnyChanges = true;
          const li = templates.listItem();
          li.textContent = `${key} ×${count}`;
          contextList.appendChild(li);
        }
      }
    });

    if (hasVisibleContext) {
      whatChangedSection.appendChild(contextHeader);
      whatChangedSection.appendChild(contextList);
    }
  }

  // Add back the toggle listener
  whatChangedSection.addEventListener('toggle', () => {
    Store.wasDetailsOpen.value = whatChangedSection.open;
  });

  // Only append the section if we have any changes to show
  if (hasAnyChanges) {
    propContainer.appendChild(whatChangedSection);
  }

  // Create inspector section
  const inspector = templates.inspector();
  const content = templates.content();

  const sections: Array<{ element: HTMLElement; hasChanges: boolean }> = [];

  // Props section
  if (Object.values(fiber.memoizedProps || {}).length) {
    tryOrElse(() => {
      sections.push({
        element: renderSection(
          componentName,
          didRender,
          fiber,
          propContainer,
          'Props',
          fiber.memoizedProps || {},
          changedProps,
          changedContext,
        ),
        hasChanges: changedProps.size > 0,
      });
    }, null);
  }

  // Context section
  if (Array.from(getAllFiberContexts(fiber).entries()).length) {
    tryOrElse(() => {
      const contextObj: Record<string, any> = {};

      Array.from(getAllFiberContexts(fiber).entries()).forEach(([contextType, value]) => {
        const contextKey = (typeof contextType === 'object' && contextType !== null)
          ? (contextType as any)?.displayName ??
          (contextType as any)?.Provider?.displayName ??
          (contextType as any)?.Consumer?.displayName ??
          'UnnamedContext'
          : contextType;

        const processValue = (val: any): any => {
          if (typeof val === 'function') {
            return '[Function]';
          }
          if (typeof val === 'object' && val !== null) {
            return Object.entries(val).reduce((acc, [k, v]) => ({
              ...acc,
              [k]: processValue(v)
            }), {});
          }
          return val;
        };

        contextObj[contextKey] = processValue(value.displayValue);
      });

      sections.push({
        element: renderSection(
          componentName,
          didRender,
          fiber,
          propContainer,
          'Context',
          contextObj,
          changedContext,
        ),
        hasChanges: changedContext.size > 0,
      });
    }, null);
  }

  // State section
  const currentState = getStateFromFiber(fiber);
  if (currentState && Object.values(currentState).length > 0) {
    tryOrElse(() => {
      const stateObj = Array.isArray(currentState)
        ? Object.fromEntries(currentState.map((val: unknown, idx: number) => [idx.toString(), val]))
        : currentState;

      for (const [key, value] of Object.entries(stateObj)) {
        const path = `${componentName}.state.${key}`;
        const lastValue = lastRendered.get(path);
        if (lastValue !== undefined && lastValue !== value) {
          changedAt.set(path, Date.now());
        }
        lastRendered.set(path, value);
      }

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
      const state = getStateFromFiber(fiber) || {};
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

export const changedAt = new Map<string, number>();
const lastRendered = new Map<string, unknown>();

let changedAtInterval: ReturnType<typeof setInterval>;

const tryOrElse = <T, E>(cb: () => T, val: E) => {
  try {
    return cb();
  } catch (e) {
    return val;
  }
};

const isPromise = (value: any): value is Promise<unknown> => {
  return (
    value &&
    (value instanceof Promise || (typeof value === 'object' && 'then' in value))
  );
};

const renderSection = (
  componentName: string,
  didRender: boolean,
  fiber: Fiber,
  propContainer: HTMLDivElement,
  title: string,
  data: any,
  changedKeys: Set<string>,
  changedContext: Set<string> = new Set(),
) => {
  const section = templates.section();
  section.dataset.section = title;

  const entries = Object.entries(data);

  entries.forEach(([key, value]) => {
    const isContextSection = title.toLowerCase() === 'context';
    const isPropsSection = title.toLowerCase() === 'props';

    // For Props section, use alternate fiber for previous values
    const displayValue = isPropsSection
      ? fiber.alternate?.memoizedProps?.[key] ?? value
      : value;

    const el = createPropertyElement(
      componentName,
      didRender,
      propContainer,
      fiber,
      key,
      displayValue,
      title.toLowerCase(),
      0,
      isContextSection ? changedContext : changedKeys,
      '',
      new WeakMap(),
      true
    );

    if (!el) return;
    section.appendChild(el);
  });

  return section;
};

const getPath = (
  componentName: string,
  section: string,
  parentPath: string,
  key: string,
) => {
  return parentPath
    ? `${componentName}.${parentPath}.${key}`
    : `${componentName}.${section}.${key}`;
};

const isEditableValue = (value: unknown): boolean => {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean';
};

export const createPropertyElement = (
  componentName: string,
  didRender: boolean,
  propsContainer: HTMLDivElement,
  fiber: any,
  key: string,
  value: any,
  section = '',
  level = 0,
  changedKeys: Set<string> = new Set(),
  parentPath = '',
  objectPathMap: WeakMap<object, Set<string>> = new WeakMap(),
  hasCumulativeChanges = false,
) => {
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

    const isBadRender =
      value &&
      ['object', 'function'].includes(typeof value) &&
      fastSerialize(value) === fastSerialize(prevValue) &&
      isChanged &&
      (changedKeys.has(key) || hasCumulativeChanges);

    lastRendered.set(currentPath, value);

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
            const el = createPropertyElement(
              componentName,
              didRender,
              propsContainer,
              fiber,
              index.toString(),
              item,
              section,
              level + 1,
              changedKeys,
              currentPath,
              objectPathMap,
              hasCumulativeChanges,
            );
            if (!el) {
              return;
            }
            content.appendChild(el);
          });
        } else {
          Object.entries(value).forEach(([k, v]) => {
            const el = createPropertyElement(
              componentName,
              didRender,
              propsContainer,
              fiber,
              k,
              v,
              section,
              level + 1,
              changedKeys,
              currentPath,
              objectPathMap,
              hasCumulativeChanges,
            );
            if (!el) {
              return;
            }
            content.appendChild(el);
          });
        }
      }

      arrow.addEventListener('click', (e) => {
        e.stopPropagation();

        const isExpanding = !container.classList.contains(
          'react-scan-expanded',
        );

        if (isExpanding) {
          EXPANDED_PATHS.add(currentPath);
          container.classList.add('react-scan-expanded');
          content.classList.remove('react-scan-hidden');

          if (!content.hasChildNodes()) {
            if (Array.isArray(value)) {
              value.forEach((item, index) => {
                const el = createPropertyElement(
                  componentName,
                  didRender,
                  propsContainer,
                  fiber,
                  index.toString(),
                  item,
                  section,
                  level + 1,
                  changedKeys,
                  currentPath,
                  new WeakMap(),
                  hasCumulativeChanges,
                );
                if (!el) {
                  return;
                }
                content.appendChild(el);
              });
            } else {
              Object.entries(value).forEach(([k, v]) => {
                const el = createPropertyElement(
                  componentName,
                  didRender,
                  propsContainer,
                  fiber,
                  k,
                  v,
                  section,
                  level + 1,
                  changedKeys,
                  currentPath,
                  new WeakMap(),
                  hasCumulativeChanges,
                );
                if (!el) {
                  return;
                }
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

            let isReplacing = false;
            const updateValue = () => {
              if (isReplacing) return;
              isReplacing = true;

              try {
                const newValue = input.value;
                const convertedValue =
                  typeof value === 'number' ? Number(newValue) :
                    typeof value === 'boolean' ? newValue === 'true' :
                      newValue;

                value = convertedValue;

                // First apply the state/prop update
                tryOrElse(() => {
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
                  } else if (section === 'state' && overrideHookState) {
                    // For class components
                    if (fiber.stateNode && typeof fiber.stateNode.setState === 'function') {
                      const path = parentPath ?
                        parentPath.split('.').filter(part => part !== 'state' && part !== componentName)
                        : [];
                      path.push(key);
                      overrideHookState(fiber, fiber.memoizedState.queue.id, path, convertedValue);
                    } else {
                      // For function components with hooks
                      let currentHook = fiber.memoizedState;
                      let hookIndex = 0;
                      const stateNames = getStateNames(fiber);

                      // Find the correct hook by matching state name
                      while (currentHook) {
                        const stateName = stateNames[hookIndex] ?? `state${hookIndex}`;

                        if (currentHook.queue) {
                          // Check if this hook contains our target state
                          let path: Array<string> = [];
                          if (parentPath) {
                            path = parentPath
                              .split('.')
                              .filter(part => part !== 'state' && part !== componentName);
                          }

                          // If this is the hook we're looking for
                          if ((path.length === 0 && stateName === key) ||
                            (path.length > 0 && path[0] === stateName)) {

                            // Remove the hook name from the path if it exists
                            if (path.length > 0 && path[0] === stateName) {
                              path.shift();
                            }

                            // Add the current key if we're editing a nested property
                            if (path.length > 0 || parentPath) {
                              path.push(key);
                            }

                            overrideHookState(
                              fiber,
                              currentHook.queue.id,
                              path,
                              convertedValue
                            );
                            break;
                          }
                        }

                        currentHook = currentHook.next;
                        hookIndex++;
                      }
                    }
                  }
                }, null);

                // Then update UI in next frame
                setTimeout(() => {
                  valueElement.textContent = getValuePreview(value);
                  if (input.parentNode) {
                    input.replaceWith(valueElement);
                  }
                }, 0);

              } catch (error) {
                if (input.parentNode) {
                  input.replaceWith(valueElement);
                }
              } finally {
                isReplacing = false;
              }
            };

            input.addEventListener('blur', updateValue);
            input.addEventListener('keydown', (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                updateValue();
              } else if (event.key === 'Escape') {
                isReplacing = true;
                if (input.parentNode) {
                  input.replaceWith(valueElement);
                }
              }
            });

            valueElement.replaceWith(input);
            input.focus();
          });
        }
      }
    }

    if (changedKeys.has(key)) {
      changedAt.set(currentPath, Date.now());
    }
    if (changedAt.has(currentPath)) {
      const flashOverlay = templates.flashOverlay();
      container.appendChild(flashOverlay);

      flashOverlay.style.opacity = '.9';

      const existingTimer = fadeOutTimers.get(flashOverlay);
      if (existingTimer !== undefined) {
        clearTimeout(existingTimer);
      }

      const timerId = setTimeout(() => {
        flashOverlay.style.transition = 'opacity 400ms ease-out';
        flashOverlay.style.opacity = '0';
        fadeOutTimers.delete(flashOverlay);
      }, 300);

      fadeOutTimers.set(flashOverlay, timerId);
    }

    return container;
  } catch {
    return null;
  }
};

const createCircularReferenceElement = (key: string) => {
  const container = templates.propertyContainer();

  const preview = templates.previewLine();
  preview.innerHTML = `
    <span class="react-scan-key">${key}:&nbsp;</span><span class="react-scan-circular">[Circular Reference]</span>
  `;
  container.appendChild(preview);
  return container;
};

export const getValueClassName = (value: any) => {
  if (Array.isArray(value)) return 'react-scan-array';
  if (value === null || value === undefined) return 'react-scan-null';
  switch (typeof value) {
    case 'string':
      return 'react-scan-string';
    case 'number':
      return 'react-scan-number';
    case 'boolean':
      return 'react-scan-boolean';
    case 'object':
      return 'react-scan-object-key';
    default:
      return '';
  }
};

export const getValuePreview = (value: any) => {
  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }
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
    case 'number':
      return value.toString();
    case 'boolean':
      return value.toString();
    case 'object': {
      if (value instanceof Promise) {
        return 'Promise';
      }
      const keys = Object.keys(value);
      if (keys.length <= 3) {
        return `{${keys.join(', ')}}`;
      }
      return `{${keys.slice(0, 8).join(', ')}, ...}`;
    }
    default:
      return typeof value;
  }
};

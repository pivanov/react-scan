// Fiber related types
export interface FiberContextValue {
  displayValue: any;
  Provider?: { displayName?: string };
  Consumer?: { displayName?: string };
}

// Template related types
export type HTMLTemplateResult<T extends HTMLElement> = () => T;

// Component data types
export interface ComponentData {
  props: Record<string, any>;
  state: Record<string, any>;
  context: Map<any, FiberContextValue>;
}

// Section types
export interface SectionData {
  element: HTMLElement;
  hasChanges: boolean;
}

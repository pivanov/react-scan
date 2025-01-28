import { signal } from '@preact/signals';

export const inspectedElementSignal = signal<HTMLElement | null>(null);

export interface TreeItem {
  name: string;
  depth: number;
  element: HTMLElement;
}

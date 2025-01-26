import { signal } from '@preact/signals';
import type { Fiber } from 'bippy';

export const inspectedElementSignal = signal<HTMLElement | null>(null);

export interface TreeItem {
  name: string;
  depth: number;
  element: HTMLElement;
  fiber: Fiber | null;
  childrenCount: number;
  updates: {
    count: number;
    lastUpdate: number;
    renderDuration: number;
    cascadeLevel: number; // how many levels deep in the update cascade
    hasStructuralChanges: boolean;
  };
}

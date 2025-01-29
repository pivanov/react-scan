import { signal } from '@preact/signals';

export interface TreeNode {
  label: string;
  children?: TreeNode[];
  element?: HTMLElement;
}

export interface FlattenedNode extends TreeNode {
  depth: number;
  nodeId: string;
  parentId: string | null;
}

export const SEARCH_PREFIX_LENGTH = 3;

export interface SearchIndex {
  prefixMap: Map<string, Set<string>>;
  nodeMap: Map<string, FlattenedNode>;
  labelMap: Map<string, string>;
  PREFIX_LENGTH: number;
}

export const inspectedElementSignal = signal<Element | null>(null);

export const searchState = signal<{
  query: string;
  matches: FlattenedNode[];
  currentMatchIndex: number;
}>({
  query: '',
  matches: [],
  currentMatchIndex: -1,
});

export interface TreeItem {
  name: string;
  depth: number;
  element: HTMLElement;
}

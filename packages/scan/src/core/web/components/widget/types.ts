export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

// For runtime state
export interface WidgetState {
  position: Position;
  size: Size;
  corner: Corner;
  lastExpandedWidth: number;
  lastExpandedHeight: number;
}

// For localStorage
export interface StoredWidgetState {
  corner: Corner;
  size: {
    width: number;
    height: number;
  };
}

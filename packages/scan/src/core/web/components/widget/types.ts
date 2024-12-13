export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface ResizeHandleProps {
  position: Corner | 'top' | 'bottom' | 'left' | 'right';
}

// Full widget runtime configuration
export interface WidgetConfig {
  corner: Corner;
  position: Position;
  size: Size;
  lastExpandedWidth: number;
  lastExpandedHeight: number;
  dimensions: {
    isFullWidth: boolean;
    isFullHeight: boolean;
    isAtTop: boolean;
    isAtBottom: boolean;
    isAtLeft: boolean;
    isAtRight: boolean;
  };
  isResizing: boolean;
  currentWidth: number;
  currentHeight: number;
  currentX: number;
  currentY: number;
}

// Persistent widget settings
export type WidgetSettings = Pick<WidgetConfig, 'corner' | 'size'>;

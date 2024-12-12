import { signal } from "@preact/signals";
import { MIN_SIZE, SAFE_AREA } from "./constants";
import { type WidgetState, type Corner, type Position } from "./types";

export const calculatePosition = (corner: Corner, width: number, height: number): Position => {
  switch (corner) {
    case 'top-right':
      return { x: window.innerWidth - width - SAFE_AREA, y: SAFE_AREA };
    case 'bottom-right':
      return { x: window.innerWidth - width - SAFE_AREA, y: window.innerHeight - height - SAFE_AREA };
    case 'bottom-left':
      return { x: SAFE_AREA, y: window.innerHeight - height - SAFE_AREA };
    case 'top-left':
    default:
      return { x: SAFE_AREA, y: SAFE_AREA };
  }
};

export const signalWidgetState = signal<WidgetState>({
  position: calculatePosition('top-left', 0, 0),
  size: { width: 0, height: 0 },
  corner: 'top-left',
  lastExpandedWidth: MIN_SIZE.width,
  lastExpandedHeight: MIN_SIZE.height,
});

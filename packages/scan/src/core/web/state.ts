import { signal } from '@preact/signals';
import { type Corner, type WidgetState } from './components/widget/types';
import { MIN_SIZE } from './components/widget/constants';
import { calculatePosition } from './components/widget/helpers';

export const signalWidgetState = signal<WidgetState>({
  position: calculatePosition('top-left', 0, 0),
  size: { width: 0, height: 0 },
  corner: 'top-left',
  lastExpandedWidth: MIN_SIZE.width,
  lastExpandedHeight: MIN_SIZE.height,
});

export const signalSelectedCorner = signal<Corner | null>(null);

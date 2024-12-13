import { signal } from '@preact/signals';
import { readLocalStorage } from '@web-utils/helpers';
import { type WidgetConfig, type WidgetSettings } from './components/widget/types';
import { LOCALSTORAGE_KEY, MIN_SIZE, SAFE_AREA } from './components/widget/constants';
import { calculatePosition } from './components/widget/helpers';

export const signalRefContainer = signal<HTMLDivElement | null>(null);

export const signalWidget = signal<WidgetConfig>(((): WidgetConfig => {
  const stored = readLocalStorage<WidgetSettings>(LOCALSTORAGE_KEY);
  const maxWidth = window.innerWidth - (SAFE_AREA * 2);
  const maxHeight = window.innerHeight - (SAFE_AREA * 2);

  const size = stored ? stored.size : { width: MIN_SIZE.width, height: MIN_SIZE.height };
  const corner = stored ? stored.corner : 'top-right' as const;
  const position = calculatePosition(corner, size.width, size.height);

  const isFullWidth = size.width >= maxWidth;
  const isFullHeight = size.height >= maxHeight;

  const posY = position.y;
  const posX = position.x;
  const sizeW = size.width as number;
  const sizeH = size.height as number;

  return {
    corner,
    position,
    size,
    lastExpandedWidth: size.width,
    lastExpandedHeight: size.height,
    dimensions: {
      isFullWidth,
      isFullHeight,
      isAtTop: position.y <= SAFE_AREA,
      isAtBottom: posY + sizeH >= window.innerHeight - SAFE_AREA,
      isAtLeft: position.x <= SAFE_AREA,
      isAtRight: posX + sizeW >= window.innerWidth - SAFE_AREA
    },
    isResizing: false,
    currentWidth: size.width,
    currentHeight: size.height,
    currentX: position.x,
    currentY: position.y
  };
})());

export const updateDimensions = (): void => {
  const { size, position } = signalWidget.value;
  const { width, height } = size as { width: number; height: number };
  const { x, y } = position as { x: number; y: number };

  signalWidget.value = {
    ...signalWidget.value,
    dimensions: {
      isFullWidth: width >= window.innerWidth - (SAFE_AREA * 2),
      isFullHeight: height >= window.innerHeight - (SAFE_AREA * 2),
      isAtTop: y <= SAFE_AREA,
      isAtBottom: y + height >= window.innerHeight - SAFE_AREA,
      isAtLeft: x <= SAFE_AREA,
      isAtRight: x + width >= window.innerWidth - SAFE_AREA
    }
  };
};

export const LOCALSTORAGE_KEY = 'react-scan-widget';

export const SAFE_AREA = 20;
export const MIN_SIZE = { width: 360, height: 240 };
export const MINIMIZED_SIZE = { width: 'min-content' } as const;
export const RESIZE_HANDLE_SIZE = 16; // 4rem from the Tailwind class

export const CORNER_CONFIGS = {
  'top-left': {
    position: { x: SAFE_AREA, y: SAFE_AREA },
    resize: { position: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2', direction: 'bottom-right' }
  },
  'top-right': {
    position: { x: (width: number) => window.innerWidth - width - SAFE_AREA, y: SAFE_AREA },
    resize: { position: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2', direction: 'bottom-left' }
  },
  'bottom-left': {
    position: { x: SAFE_AREA, y: (height: number) => window.innerHeight - height - SAFE_AREA },
    resize: { position: 'top-0 right-0 translate-x-1/2 -translate-y-1/2', direction: 'top-right' }
  },
  'bottom-right': {
    position: {
      x: (width: number) => window.innerWidth - width - SAFE_AREA,
      y: (height: number) => window.innerHeight - height - SAFE_AREA
    },
    resize: { position: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2', direction: 'top-left' }
  }
} as const;

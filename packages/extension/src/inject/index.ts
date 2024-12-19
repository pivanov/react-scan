import { broadcast, canLoadReactScan, getReactVersion, readLocalStorage, saveLocalStorage } from '../utils/helpers';
import { createReactNotAvailableUI, toggleReactIsNotAvailable } from './react-is-not-available';

let isReactAvailable: string | undefined = undefined;

(async () => {
  if (!canLoadReactScan) {
    return;
  }

  if (isReactAvailable !== undefined) {
    return isReactAvailable;
  }

  broadcast.onmessage = async (type, data) => {
    if (type === 'react-scan:toggle-state') {
      broadcast.postMessage('react-scan:react-version', {
        version: isReactAvailable
      });

      if (isReactAvailable) {
        const state = data?.state;
        if (!state) {
          const widgetSettings = readLocalStorage<{ corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }>('react-scan-widget-settings');
          if (widgetSettings !== null) {
            saveLocalStorage('react-scan-options', {
              corner: widgetSettings.corner
            });
          }
        }
        _reactScan.setOptions({
          enabled: state,
          showToolbar: state
        });
      } else {
        toggleReactIsNotAvailable();
      }
    }
  };
})();


window.addEventListener('DOMContentLoaded', async () => {
  const reactVersion = await getReactVersion();
  isReactAvailable = reactVersion;
  if (!reactVersion) {
    createReactNotAvailableUI();
  }

  _reactScan.ReactScanInternals.Store.inspectState.subscribe((state) => {
    broadcast.postMessage('react-scan:is-focused', {
      state: state.kind === 'focused'
    });
  });
});

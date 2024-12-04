import '../utils/dev-tools-hook';

import noReactStyles from '../assets/css/no-react.css?inline';

import { getReactVersion, loadCss } from '../utils/helpers';

const CACHE_NAME = 'react-scan-cache';

const scriptsToInject = [
  'https://unpkg.com/react-scan/dist/auto.global.js',
];

const injectScript = (scriptURL: string, scriptContent: string) => {
  // Check if script already exists
  const existingScript = document.getElementById(scriptURL);
  if (existingScript) {
    return;
  }

  // Create a Blob containing the script content
  const blob = new Blob([scriptContent], { type: 'text/javascript' });
  const blobURL = URL.createObjectURL(blob);

  const script = document.createElement('script');
  script.id = scriptURL;
  script.src = blobURL;

  // Clean up the blob URL after the script loads
  script.onload = () => {
    URL.revokeObjectURL(blobURL);
  };

  document.documentElement.appendChild(script);
};

async function injectReactScan() {
  try {
    const cache = await caches.open(CACHE_NAME);
    let needsReload = false;

    for (const scriptURL of scriptsToInject) {
      // Try to get from cache first
      let response = await cache.match(scriptURL);

      if (!response) {
        needsReload = true;

        // If not in cache, fetch and store
        response = await fetch(scriptURL, {
          cache: 'no-store',
        });

        // Only cache successful responses
        if (response.ok) {
          await cache.put(scriptURL, response.clone());
        }
      }

      const scriptContent = await response.text();
      injectScript(scriptURL, scriptContent);
    }

    // Reload the page if any files were fetched
    // This is necessary to ensure the scripts are loaded immediately
    if (needsReload) {
      window.location.reload();
    }
  } catch (error) {
    // Silent fail
  }
}

window.addEventListener('react-scan:is-csp-rules-enabled', (event) => {
  const cspRulesEnabled = (event as CustomEvent).detail.enabled;

  if (cspRulesEnabled) {
    void injectReactScan();
  }
});

window.addEventListener('react-scan:state-change', (event: Event) => {
  const { enabled } = (event as CustomEvent).detail;
  if (
    typeof window.__REACT_SCAN__?.ReactScanInternals === 'object' &&
    window.__REACT_SCAN__?.ReactScanInternals !== null
  ) {
    window.__REACT_SCAN__.ReactScanInternals.isPaused = enabled;
  }
});

window.addEventListener('DOMContentLoaded', () => {
  window.dispatchEvent(
    new CustomEvent('react-scan:update', {
      detail: {
        reactVersion: getReactVersion(),
      },
    }),
  );
});

(() => {
  // Toast
  const noReactStylesElement = document.createElement('style');
  noReactStylesElement.id = 'react-scan-no-react-styles';
  noReactStylesElement.innerHTML = noReactStyles;
  void loadCss(noReactStyles);

  const toast = document.createElement('div');
  toast.id = 'react-scan-toast';

  const message = document.createElement('span');
  message.id = 'react-scan-toast-message';
  message.innerHTML = "<span class='icon'>⚛️</span> React is not detected on this page. <br />Please ensure you're visiting a React application!";

  const button = document.createElement('button');
  button.id = 'react-scan-toast-close-button';
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
  button.onclick = () => {
    document.documentElement.classList.remove('freeze');
    backdrop.className = 'animate-fade-out';
  };

  toast.appendChild(message);
  toast.appendChild(button);

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'react-scan-backdrop';
  backdrop.onclick = () => {
    document.documentElement.classList.remove('freeze');
    backdrop.className = 'animate-fade-out';
  };

  const fragment = document.createDocumentFragment();
  fragment.appendChild(noReactStylesElement);
  fragment.appendChild(backdrop);
  fragment.appendChild(toast);

  document.documentElement.appendChild(fragment);

  window.addEventListener('react-scan:check-version', async () => {
    const version = getReactVersion();
    const isReactDetected = !['Unknown', 'Not Found'].includes(version);

    window.dispatchEvent(
      new CustomEvent('react-scan:version-check-result', {
        detail: { isReactDetected, version }
      })
    );

    if (['Unknown', 'Not Found'].includes(version)) {
      document.documentElement.classList.add('freeze');
      backdrop.className = 'animate-fade-in';
    }
  });
})();

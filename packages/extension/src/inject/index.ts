const CACHE_NAME = 'react-scan-cache';

const scriptsToInject = [
  'https://qd9xd5rnyl6l4hgpaz4c5878idh7w2.files-sashido.cloud/b813c4e087032dfe959395266980688e_scan-dist.js',
  'https://unpkg.com/react-scan/dist/auto.global.js',
];

const injectScript = (injectScript: string) => {
  const script = document.createElement('script');
  script.textContent = injectScript;
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
      injectScript(scriptContent);
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

function getReactVersion(): string {
  const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook || !hook.renderers) {
    return 'Not Found';
  }

  // Get the first renderer
  const firstRenderer = Array.from(hook.renderers.values())[0];
  if (!firstRenderer) {
    return 'Not Found';
  }

  const version = (firstRenderer as any)?.version;
  return version ?? 'Unknown';
}

void (async () => {
  if (localStorage.getItem('cspRulesEnabled')) {
    await injectReactScan();

    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('react-scan:update', {
          detail: {
            reactVersion: getReactVersion(),
          },
        }),
      );
    }, 1000);
  }
})();

window.addEventListener('react-scan:csp-changed', (message: Event) => {
  const customEvent = message as CustomEvent;
  if (customEvent.detail.enabled) {
    localStorage.setItem('cspRulesEnabled', 'true');
  } else {
    localStorage.removeItem('cspRulesEnabled');
  }

  window.location.reload();
});

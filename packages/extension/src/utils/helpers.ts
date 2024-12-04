export const NO_OP = () => {
  /**/
};

export const getReactVersion = (): string => {
  const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook || !hook.renderers) {
    return 'Not Found';
  }

  // Get the first renderer
  const firstRenderer = Array.from(hook.renderers.values())[0];
  if (!firstRenderer) {
    return 'Not Found';
  }

  const version = (firstRenderer)?.version;
  return version ?? 'Unknown';
}


export const isInternalUrl = (url: string): boolean => {
  if (!url) return false;

  const allowedProtocols = ['http:', 'https:', 'file:'];
  return !allowedProtocols.includes(new URL(url).protocol);
};

export const loadCss = (css: string) => {
  const style = document.createElement('style');
  style.innerHTML = css;
  document.documentElement.appendChild(style);
};

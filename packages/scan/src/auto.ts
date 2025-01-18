import { Options, scan } from './index';
import { init } from './install-hook';

init();

if (typeof window !== 'undefined') {
  let options: Partial<Options> = {};
  if (!document.currentScript) {
    options.dangerouslyForceRunInProduction = true;
  }
  scan(options);
  window.reactScan = scan;
}

export * from './core';

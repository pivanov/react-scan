import * as reactScan from 'react-scan';
import { canLoadReactScan } from '../utils/helpers';

window.isReactScanExtension = true;

// Initialize reactScan global with all exports
window.reactScan = reactScan.setOptions;
globalThis._reactScan = reactScan;

if (canLoadReactScan) {
  // Initial scan setup
  reactScan.scan();
}

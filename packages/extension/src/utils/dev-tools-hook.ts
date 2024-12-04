import { NO_OP } from './helpers';

// Initialize hook immediately when module is loaded
const devtoolsHook = {
  checkDCE: NO_OP,
  supportsFiber: true,
  renderers: new Map(),
  onScheduleFiberRoot: NO_OP,
  onCommitFiberRoot: NO_OP,
  onCommitFiberUnmount: NO_OP,
  inject(renderer: unknown) {
    const nextID = this.renderers.size + 1;
    this.renderers.set(nextID, renderer);
    return nextID;
  },
};

// Set hook immediately
globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = devtoolsHook;

const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
if (hook) {
  hook.onCommitFiberRoot = NO_OP;
}

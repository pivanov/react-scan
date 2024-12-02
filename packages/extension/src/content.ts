import { IncomingMessageSchema, type OutgoingMessage } from './types/messages';

chrome.runtime.onMessage.addListener((message: unknown) => {
  const { data, error } = IncomingMessageSchema.safeParse(message);
  if (error) {
    console.error('Invalid message', error);
    return;
  }

  switch (data.type) {
    case 'OPEN_PANEL':
      window.dispatchEvent(new CustomEvent('react-scan:toggle-panel'));
      break;
    case 'START_SCAN':
      window.dispatchEvent(new CustomEvent('react-scan:start'));
      // Send initial version when scanning starts
      break;
    case 'STOP_SCAN':
      window.dispatchEvent(new CustomEvent('react-scan:stop'));
      break;
    case 'CSP_RULES_CHANGED':
      window.dispatchEvent(
        new CustomEvent('react-scan:csp-changed', {
          detail: { ...data.data },
        }),
      );
      break;
  }
});

window.addEventListener('react-scan:update', ((event: Event) => {
  const customEvent = event as CustomEvent;
  const message: OutgoingMessage = {
    type: 'SCAN_UPDATE',
    ...customEvent.detail,
  };
  chrome.runtime.sendMessage(message);
}) as EventListener);

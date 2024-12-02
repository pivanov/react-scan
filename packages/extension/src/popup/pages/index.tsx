import './index.css';
import { useCallback, useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import { OutgoingMessageSchema } from '../../types/messages';
import { CspManager } from './csp';

async function getCurrentTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

interface PageState {
  reactVersion: string;
  componentCount: number;
  rerenderCount: number;
  status: string;
}

export default function Popup() {
  const [enabled, setEnabled] = useState(true);
  const [pageState, setPageState] = useState<PageState>({
    reactVersion: '-',
    componentCount: 0,
    rerenderCount: 0,
    status: 'Scanning...',
  });

  useEffect(() => {
    // Connect to background script
    const port = browser.runtime.connect({ name: 'popup' });

    // Listen for initial state and updates
    const listener = (message: unknown) => {
      const result = OutgoingMessageSchema.safeParse(message);
      if (!result.success) {
        return;
      }

      if (result.data.type === 'SCAN_UPDATE') {
        setPageState({
          reactVersion: result.data.reactVersion ?? '-',
          componentCount: result.data.componentCount ?? 0,
          rerenderCount: result.data.rerenderCount ?? 0,
          status: result.data.status ?? 'Scanning...',
        });
      }
    };

    port.onMessage.addListener(listener);
    browser.runtime.onMessage.addListener(listener);

    return () => {
      port.onMessage.removeListener(listener);
      browser.runtime.onMessage.removeListener(listener);
      port.disconnect();
    };
  }, []);

  const onPanelClick = useCallback(() => {
    void getCurrentTab().then((tab) => {
      if (!tab.id) return;
      void browser.tabs.sendMessage(tab.id, { type: 'OPEN_PANEL' });
    });
  }, []);

  useEffect(() => {
    void getCurrentTab().then((tab) => {
      if (!tab.id) return;
      void browser.tabs.sendMessage(tab.id, {
        type: enabled ? 'START_SCAN' : 'STOP_SCAN',
      });
    });
  }, [enabled]);

  return (
    <div className="container">
      <CspManager />
      <button
        onClick={() => setEnabled(!enabled)}
        className={enabled ? '' : 'toggle-disabled'}
      >
        {enabled ? 'Stop Scan' : 'Start Scan'}
      </button>
      <div className="stats">
        <div className="stat-row">
          <span>React Version</span>
          <span>{pageState.reactVersion}</span>
        </div>
        <div className="stat-row">
          <span>Component Count</span>
          <span>{pageState.componentCount}</span>
        </div>
        <div className="stat-row">
          <span>Re-render Count</span>
          <span>{pageState.rerenderCount}</span>
        </div>
      </div>
      <button onClick={onPanelClick}>Open Details Panel</button>
      <div className="status">{pageState.status}</div>
    </div>
  );
}

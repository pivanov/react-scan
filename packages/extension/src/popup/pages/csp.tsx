import { useCallback, useEffect, useState } from 'react';
import browser from 'webextension-polyfill';

async function getCurrentTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

export function CspManager() {
  const [cspRulesEnabled, setCspRulesEnabled] = useState(false);

  // Load initial CSP rules state
  useEffect(() => {
    void browser.storage.local.get('cspRulesEnabled').then((result) => {
      setCspRulesEnabled(result.cspRulesEnabled ?? false);
    });
  }, []);

  // Handle CSP rules toggle
  const handleCspToggle = useCallback(async () => {
    const newState = !cspRulesEnabled;

    // Update storage
    await browser.storage.local.set({ cspRulesEnabled: newState });

    if (newState) {
      // Enable CSP rules
      await browser.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: ['react_scan_csp_rules'],
      });
    } else {
      // Disable CSP rules
      await browser.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: ['react_scan_csp_rules'],
      });
    }

    // Reload current tab
    const currentTab = await getCurrentTab();
    if (currentTab?.id) {
      await browser.tabs.sendMessage(currentTab.id, {
        type: 'CSP_RULES_CHANGED',
        data: {
          enabled: newState,
        },
      });
    }

    setCspRulesEnabled(newState);
  }, [cspRulesEnabled]);

  return (
    <>
      <div className="setting-row">
        <label>CSP Rules</label>
        <input
          type="checkbox"
          checked={cspRulesEnabled}
          onChange={handleCspToggle}
        />
      </div>
      <div className="info-text">
        {cspRulesEnabled
          ? 'CSP rules are enabled. Some sites may require a page reload.'
          : 'CSP rules are disabled. Enable to bypass Content Security Policy.'}
      </div>
    </>
  );
}

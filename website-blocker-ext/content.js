// content.js - Injected into the web app to relay messages between the webpage and the extension

// 1. Webpage -> Extension Relay
window.addEventListener('message', (event) => {
    // We only accept messages from ourselves
    if (event.source !== window) return;

    if (event.data && (event.data.type === 'SYNC_BLOCKER' || event.data.type === 'SYNC_THEME')) {
        // Relay to background script
        chrome.runtime.sendMessage(event.data);
    }
});

// 2. Extension -> Webpage Relay
// Listen for changes in extension storage (e.g., user toggles focus from the popup)
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.isFocused) {
        // Send a message to the React app
        window.postMessage({
            type: 'EXT_STATE_CHANGE',
            payload: {
                isFocused: changes.isFocused.newValue,
                sessionStart: changes.sessionStart ? changes.sessionStart.newValue : null
            }
        }, '*');
    }
});

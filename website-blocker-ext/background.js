// Listens for messages from the popup or external sites
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SYNC_BLOCKER') {
        const { isFocused, blacklist, sessionStart } = request.payload;
        
        chrome.storage.local.set({ isFocused, blacklist, sessionStart }, () => {
             updateBlockingRules(isFocused, blacklist);
             if (sendResponse) sendResponse({ success: true });
        });
        return true; 
    }

    if (request.type === 'SYNC_THEME') {
        chrome.storage.local.set({ theme: request.payload.theme }, () => {
             if (sendResponse) sendResponse({ success: true });
        });
        return true;
    }
});

// Update the dynamic blocking rules
async function updateBlockingRules(isFocused, blacklist) {
    if (!isFocused || !blacklist || blacklist.length === 0) {
        // Clear all rules
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: (await chrome.declarativeNetRequest.getDynamicRules()).map(r => r.id)
        });
        console.log("Option Blocker: Disabled, all rules cleared.");
        return;
    }

    // Generate new rules
    const newRules = blacklist.map((domain, index) => {
        // clean domain just to be sure
        const cleanedDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        return {
            id: index + 1, // Rule IDs must be 1 or greater
            priority: 1,
            action: { 
                type: 'redirect',
                redirect: { extensionPath: '/blocked.html' }
            },
            condition: {
                urlFilter: `*://${cleanedDomain}/*`,
                resourceTypes: ['main_frame']
            }
        };
    });

    // Replace old rules with new ones
    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: (await chrome.declarativeNetRequest.getDynamicRules()).map(r => r.id),
        addRules: newRules
    });

    console.log(`Option Blocker: Active. Blocking ${blacklist.length} domains.`);
}

// Initial hydration on startup
chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.get(['isFocused', 'blacklist'], (data) => {
        updateBlockingRules(data.isFocused, data.blacklist);
    });
});

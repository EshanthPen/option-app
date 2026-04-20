document.addEventListener('DOMContentLoaded', () => {
    const statusBadge = document.getElementById('statusBadge');
    const domainsText = document.getElementById('domainsText');
    const openAppBtn = document.getElementById('openAppBtn');
    const toggleFocusBtn = document.getElementById('toggleFocusBtn');

    let currentFocusedState = false;

    function updateUI(isFocused, blacklist) {
        currentFocusedState = isFocused;
        if (isFocused) {
            statusBadge.textContent = 'Focus Active';
            statusBadge.className = 'status active';
            const count = blacklist ? blacklist.length : 0;
            domainsText.textContent = `Currently blocking ${count} website${count !== 1 ? 's' : ''}.`;
            toggleFocusBtn.textContent = 'Stop Focus';
        } else {
            statusBadge.textContent = 'Focus Inactive';
            statusBadge.className = 'status inactive';
            domainsText.textContent = 'Ready to block distracting websites. Start a session in the app or toggle here.';
            toggleFocusBtn.textContent = 'Start Focus';
        }
    }

    openAppBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://optionapp.online' });
    });

    toggleFocusBtn.addEventListener('click', () => {
        const newState = !currentFocusedState;
        chrome.storage.local.get(['blacklist'], (data) => {
            const payload = {
                isFocused: newState,
                blacklist: data.blacklist || [],
                sessionStart: newState ? Date.now() : null
            };
            chrome.runtime.sendMessage({ type: 'SYNC_BLOCKER', payload }, () => {
                updateUI(newState, payload.blacklist);
            });
        });
    });

    function applyThemeToVars(theme) {
        if (!theme) return;
        Object.keys(theme).forEach(key => {
            document.documentElement.style.setProperty(`--${key}`, theme[key]);
        });
    }

    chrome.storage.local.get(['isFocused', 'blacklist', 'theme'], (data) => {
        applyThemeToVars(data.theme);
        updateUI(data.isFocused, data.blacklist);
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.theme) {
            applyThemeToVars(changes.theme.newValue);
        }
    });
});

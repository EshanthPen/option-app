document.addEventListener('DOMContentLoaded', () => {
    const statusBadge = document.getElementById('statusBadge');
    const domainsText = document.getElementById('domainsText');
    const openAppBtn = document.getElementById('openAppBtn');

    openAppBtn.addEventListener('click', () => {
        // Change this to your hosted URL once deployed, e.g., https://optionapp.com
        chrome.tabs.create({ url: 'http://localhost:8081' });
    });

    chrome.storage.local.get(['isFocused', 'blacklist'], (data) => {
        if (data.isFocused) {
            statusBadge.textContent = 'Focus Active';
            statusBadge.className = 'status active';
            const count = data.blacklist ? data.blacklist.length : 0;
            domainsText.textContent = `Currently blocking ${count} website${count !== 1 ? 's' : ''}.`;
        } else {
            statusBadge.textContent = 'Focus Inactive';
            statusBadge.className = 'status inactive';
            domainsText.textContent = 'Ready to block distracting websites. Start a session in the app.';
        }
    });
});

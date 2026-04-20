document.addEventListener('DOMContentLoaded', () => {
    const timerElement = document.getElementById('focusTimer');
    let sessionStart = null;
    let intervalId = null;

    function updateTimer() {
        if (!sessionStart) return;
        const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
        if (elapsed < 0) return;
        
        const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const seconds = String(elapsed % 60).padStart(2, '0');
        timerElement.textContent = `${minutes}:${seconds}`;
    }

    function applyThemeToVars(theme) {
        if (!theme) return;
        Object.keys(theme).forEach(key => {
            document.documentElement.style.setProperty(`--${key}`, theme[key]);
        });
    }

    chrome.storage.local.get(['sessionStart', 'theme'], (data) => {
        applyThemeToVars(data.theme);
        if (data.sessionStart) {
            sessionStart = data.sessionStart;
            updateTimer();
            intervalId = setInterval(updateTimer, 1000);
        } else {
            timerElement.textContent = "00:00";
        }
    });

    // Listen for changes just in case it resets while the page is open
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes.theme) {
                applyThemeToVars(changes.theme.newValue);
            }
            if (changes.sessionStart) {
                sessionStart = changes.sessionStart.newValue;
                if (!sessionStart) {
                    clearInterval(intervalId);
                    timerElement.textContent = "00:00";
                }
            }
        }
    });
});

// Option App - Focus Blocker Popup

const PRESETS = {
  'Social Media': {
    emoji: '📱',
    domains: [
      'instagram.com', 'www.instagram.com',
      'tiktok.com', 'www.tiktok.com',
      'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com',
      'facebook.com', 'www.facebook.com',
      'snapchat.com', 'www.snapchat.com',
      'reddit.com', 'www.reddit.com',
      'threads.net', 'www.threads.net',
      'pinterest.com', 'www.pinterest.com',
      'tumblr.com', 'www.tumblr.com'
    ]
  },
  'Gaming': {
    emoji: '🎮',
    domains: [
      'store.steampowered.com', 'steampowered.com', 'steamcommunity.com',
      'twitch.tv', 'www.twitch.tv',
      'roblox.com', 'www.roblox.com',
      'epicgames.com', 'www.epicgames.com',
      'discord.com', 'www.discord.com',
      'minecraft.net', 'www.minecraft.net',
      'ea.com', 'www.ea.com',
      'blizzard.com', 'www.blizzard.com'
    ]
  },
  'Entertainment': {
    emoji: '🎬',
    domains: [
      'youtube.com', 'www.youtube.com', 'm.youtube.com',
      'netflix.com', 'www.netflix.com',
      'hulu.com', 'www.hulu.com',
      'disneyplus.com', 'www.disneyplus.com',
      'max.com', 'www.max.com',
      'primevideo.com', 'www.primevideo.com',
      'crunchyroll.com', 'www.crunchyroll.com',
      'spotify.com', 'open.spotify.com'
    ]
  },
  'News': {
    emoji: '📰',
    domains: [
      'cnn.com', 'www.cnn.com',
      'foxnews.com', 'www.foxnews.com',
      'bbc.com', 'www.bbc.com', 'bbc.co.uk', 'www.bbc.co.uk',
      'nytimes.com', 'www.nytimes.com',
      'washingtonpost.com', 'www.washingtonpost.com',
      'reuters.com', 'www.reuters.com',
      'apnews.com', 'www.apnews.com'
    ]
  },
  'Shopping': {
    emoji: '🛒',
    domains: [
      'amazon.com', 'www.amazon.com',
      'ebay.com', 'www.ebay.com',
      'shein.com', 'www.shein.com',
      'walmart.com', 'www.walmart.com',
      'target.com', 'www.target.com',
      'etsy.com', 'www.etsy.com',
      'aliexpress.com', 'www.aliexpress.com',
      'temu.com', 'www.temu.com'
    ]
  }
};

// State
let state = {
  enabled: true,
  activePresets: [],
  customDomains: []
};

// DOM
const masterToggle = document.getElementById('masterToggle');
const statusBar = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');
const statusDot = statusBar.querySelector('.status-dot');
const blockedCount = document.getElementById('blockedCount');
const presetList = document.getElementById('presetList');
const customList = document.getElementById('customList');
const customSiteInput = document.getElementById('customSiteInput');
const addSiteBtn = document.getElementById('addSiteBtn');

// Load state from storage
async function loadState() {
  const data = await chrome.storage.local.get(['enabled', 'activePresets', 'customDomains']);
  state.enabled = data.enabled !== false;
  state.activePresets = data.activePresets || [];
  state.customDomains = data.customDomains || [];
  render();
}

// Save state to storage
async function saveState() {
  await chrome.storage.local.set({
    enabled: state.enabled,
    activePresets: state.activePresets,
    customDomains: state.customDomains
  });
}

// Count total blocked domains
function getTotalBlocked() {
  let count = 0;
  const seen = new Set();
  for (const preset of state.activePresets) {
    if (PRESETS[preset]) {
      for (const d of PRESETS[preset].domains) {
        // Only count base domains (no www)
        const base = d.replace('www.', '').replace('m.', '').replace('open.', '').replace('store.', '');
        seen.add(base);
      }
    }
  }
  for (const d of state.customDomains) {
    seen.add(d.replace('www.', ''));
  }
  return seen.size;
}

// Parse domain from user input
function parseDomain(input) {
  let domain = input.trim().toLowerCase();
  // Remove protocol
  domain = domain.replace(/^https?:\/\//, '');
  // Remove path
  domain = domain.split('/')[0];
  // Remove port
  domain = domain.split(':')[0];
  // Remove www
  domain = domain.replace(/^www\./, '');
  return domain;
}

// Render UI
function render() {
  // Master toggle
  masterToggle.checked = state.enabled;
  document.body.classList.toggle('disabled', !state.enabled);

  // Status
  if (state.enabled) {
    statusDot.classList.add('active');
    const count = getTotalBlocked();
    statusText.textContent = count > 0 ? 'Blocking active' : 'No sites blocked';
    blockedCount.textContent = count;
  } else {
    statusDot.classList.remove('active');
    statusText.textContent = 'Blocking paused';
    blockedCount.textContent = '0';
  }

  // Presets
  presetList.innerHTML = '';
  for (const [name, config] of Object.entries(PRESETS)) {
    const chip = document.createElement('div');
    chip.className = 'preset-chip' + (state.activePresets.includes(name) ? ' active' : '');
    // Count unique base domains in preset
    const uniqueBase = new Set(config.domains.map(d => d.replace('www.', '').replace('m.', '').replace('open.', '').replace('store.', '')));
    chip.innerHTML = `<span class="emoji">${config.emoji}</span>${name}<span class="count">(${uniqueBase.size})</span>`;
    chip.addEventListener('click', () => togglePreset(name));
    presetList.appendChild(chip);
  }

  // Custom domains
  customList.innerHTML = '';
  if (state.customDomains.length === 0) {
    customList.innerHTML = '<div class="empty-state">No custom sites added yet</div>';
  } else {
    for (const domain of state.customDomains) {
      const item = document.createElement('div');
      item.className = 'custom-item';
      item.innerHTML = `
        <span class="domain">${domain}</span>
        <button class="btn-remove" data-domain="${domain}">&times;</button>
      `;
      item.querySelector('.btn-remove').addEventListener('click', () => removeCustomDomain(domain));
      customList.appendChild(item);
    }
  }
}

// Toggle master switch
masterToggle.addEventListener('change', async () => {
  state.enabled = masterToggle.checked;
  await saveState();
  render();
});

// Toggle preset category
async function togglePreset(name) {
  const idx = state.activePresets.indexOf(name);
  if (idx >= 0) {
    state.activePresets.splice(idx, 1);
  } else {
    state.activePresets.push(name);
  }
  await saveState();
  render();
}

// Add custom domain
async function addCustomDomain() {
  const domain = parseDomain(customSiteInput.value);
  if (!domain || domain.length < 3 || !domain.includes('.')) return;

  if (!state.customDomains.includes(domain)) {
    state.customDomains.push(domain);
    // Also add www variant
    const wwwDomain = 'www.' + domain;
    if (!state.customDomains.includes(wwwDomain)) {
      state.customDomains.push(wwwDomain);
    }
    await saveState();
    render();
  }
  customSiteInput.value = '';
}

addSiteBtn.addEventListener('click', addCustomDomain);
customSiteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addCustomDomain();
});

// Remove custom domain
async function removeCustomDomain(domain) {
  state.customDomains = state.customDomains.filter(d => {
    const base = d.replace('www.', '');
    const targetBase = domain.replace('www.', '');
    return base !== targetBase;
  });
  await saveState();
  render();
}

// Init
loadState();

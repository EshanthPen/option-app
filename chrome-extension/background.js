// Option App - Website Blocker Background Service Worker

const PRESETS = {
  'Social Media': [
    'instagram.com', 'www.instagram.com',
    'tiktok.com', 'www.tiktok.com',
    'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com',
    'facebook.com', 'www.facebook.com',
    'snapchat.com', 'www.snapchat.com',
    'reddit.com', 'www.reddit.com',
    'threads.net', 'www.threads.net',
    'pinterest.com', 'www.pinterest.com',
    'tumblr.com', 'www.tumblr.com'
  ],
  'Gaming': [
    'store.steampowered.com', 'steampowered.com', 'steamcommunity.com',
    'twitch.tv', 'www.twitch.tv',
    'roblox.com', 'www.roblox.com',
    'epicgames.com', 'www.epicgames.com',
    'discord.com', 'www.discord.com',
    'minecraft.net', 'www.minecraft.net',
    'ea.com', 'www.ea.com',
    'blizzard.com', 'www.blizzard.com'
  ],
  'Entertainment': [
    'youtube.com', 'www.youtube.com', 'm.youtube.com',
    'netflix.com', 'www.netflix.com',
    'hulu.com', 'www.hulu.com',
    'disneyplus.com', 'www.disneyplus.com',
    'max.com', 'www.max.com',
    'primevideo.com', 'www.primevideo.com',
    'crunchyroll.com', 'www.crunchyroll.com',
    'twitch.tv', 'www.twitch.tv',
    'spotify.com', 'open.spotify.com'
  ],
  'News': [
    'cnn.com', 'www.cnn.com',
    'foxnews.com', 'www.foxnews.com',
    'bbc.com', 'www.bbc.com', 'bbc.co.uk', 'www.bbc.co.uk',
    'nytimes.com', 'www.nytimes.com',
    'washingtonpost.com', 'www.washingtonpost.com',
    'reuters.com', 'www.reuters.com',
    'apnews.com', 'www.apnews.com'
  ],
  'Shopping': [
    'amazon.com', 'www.amazon.com',
    'ebay.com', 'www.ebay.com',
    'shein.com', 'www.shein.com',
    'walmart.com', 'www.walmart.com',
    'target.com', 'www.target.com',
    'etsy.com', 'www.etsy.com',
    'aliexpress.com', 'www.aliexpress.com',
    'temu.com', 'www.temu.com'
  ]
};

// Build blocking rules from domain list
function buildRules(domains) {
  const uniqueDomains = [...new Set(domains)];
  return uniqueDomains.map((domain, index) => ({
    id: index + 1,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: {
        extensionPath: '/blocked.html'
      }
    },
    condition: {
      urlFilter: `||${domain}`,
      resourceTypes: ['main_frame']
    }
  }));
}

// Apply blocking rules
async function applyRules() {
  const data = await chrome.storage.local.get(['enabled', 'blockedDomains', 'activePresets', 'customDomains']);

  const enabled = data.enabled !== false; // default true

  // Remove all existing rules first
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existingRules.map(r => r.id);

  if (!enabled || (!data.blockedDomains?.length && !data.activePresets?.length && !data.customDomains?.length)) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingIds,
      addRules: []
    });
    return;
  }

  // Collect all domains to block
  let allDomains = [];

  // Add preset domains
  if (data.activePresets) {
    for (const preset of data.activePresets) {
      if (PRESETS[preset]) {
        allDomains = allDomains.concat(PRESETS[preset]);
      }
    }
  }

  // Add custom domains
  if (data.customDomains) {
    allDomains = allDomains.concat(data.customDomains);
  }

  // Add any manually blocked domains
  if (data.blockedDomains) {
    allDomains = allDomains.concat(data.blockedDomains);
  }

  const rules = buildRules(allDomains);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingIds,
    addRules: rules
  });
}

// Listen for storage changes to reapply rules
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    applyRules();
  }
});

// Apply rules on install/startup
chrome.runtime.onInstalled.addListener(() => {
  // Set defaults
  chrome.storage.local.get(['enabled', 'activePresets', 'customDomains'], (data) => {
    if (data.enabled === undefined) {
      chrome.storage.local.set({ enabled: true });
    }
    if (!data.activePresets) {
      chrome.storage.local.set({ activePresets: [] });
    }
    if (!data.customDomains) {
      chrome.storage.local.set({ customDomains: [] });
    }
    applyRules();
  });
});

chrome.runtime.onStartup.addListener(() => {
  applyRules();
});

// Export presets for popup
self.PRESETS = PRESETS;

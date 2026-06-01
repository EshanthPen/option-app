const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable experimental package exports to fix resolution issues with library vendor packages (like victory-vendor)
config.resolver.unstable_enablePackageExports = false;

module.exports = config;

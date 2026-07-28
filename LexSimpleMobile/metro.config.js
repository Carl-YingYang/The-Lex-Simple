// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

// Kinukuha natin ang default settings ng Expo
const config = getDefaultConfig(__dirname);

// Sinasabi natin sa bundler: "Kapag nakakita ka ng .gguf file, isama mo sa app"
config.resolver.assetExts.push('gguf');

module.exports = config;
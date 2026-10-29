// Expo's default Metro setup. (react-native-svg-transformer was removed for
// SDK 58: it no longer loads, and no screen in use imports .svg files.
// Icons are drawn with react-native-svg components instead.)
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);

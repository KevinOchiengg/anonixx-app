const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)
config.resolver.sourceExts.push('css')

// @stripe/stripe-react-native pulls in RN internals that don't exist on web
// (codegenNativeCommands/Component), which breaks the web bundle. Swap it for
// a no-op stub when bundling for web only.
const { resolveRequest: defaultResolveRequest } = config.resolver
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === '@stripe/stripe-react-native') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'src/shims/stripe-react-native.web.js'),
    }
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform)
}

module.exports = config

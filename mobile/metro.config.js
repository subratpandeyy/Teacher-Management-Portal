const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Allow imports from teacher-portal/shared (e.g. ../../shared/storage)
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Block admin-web node_modules to prevent heavy bundling/crashes
config.resolver.blockList = [
  new RegExp(`${path.resolve(workspaceRoot, 'admin-web/node_modules').replace(/[/\\\\]/g, '[/\\\\]')}.*`),
];

module.exports = withNativeWind(config, { input: './global.css' });

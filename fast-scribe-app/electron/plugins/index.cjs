const { registerBuiltinPlugins } = require('./builtin-plugins.cjs');
const { createBuiltinRegistries } = require('./registry.cjs');

function createPluginSystem() {
  const system = createBuiltinRegistries();
  registerBuiltinPlugins(system.plugins);
  return system;
}

module.exports = {
  createPluginSystem,
};

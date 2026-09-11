const {
  ANONYMIZATION_MAP_ARTIFACT_TYPE,
  TEXT_ARTIFACT_TYPE,
  throwIfPipelineCancelled,
} = require('./contracts.cjs');

const placeholderAnonymizer = {
  manifest: {
    id: 'fast-scribe.placeholder-anonymizer',
    version: '1.0.0',
    name: 'Placeholder anonymizer',
    description: 'Demonstrates a text transform and replacement-map output. Not production anonymization.',
    inputs: [
      { id: 'text', type: TEXT_ARTIFACT_TYPE, required: true },
    ],
    outputs: [
      { id: 'text', type: TEXT_ARTIFACT_TYPE, required: true },
      { id: 'map', type: ANONYMIZATION_MAP_ARTIFACT_TYPE, required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        marker: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  async execute({ inputs, config, signal }) {
    throwIfPipelineCancelled(signal);
    const replacements = [];
    let index = 0;
    const transformed = inputs.text.replace(/\b\d+\b/g, (original) => {
      index += 1;
      const token = `[NUMBER_${index}]`;
      replacements.push({ token, original });
      return token;
    });
    const marker = config.marker || '[Placeholder anonymization applied]';

    return {
      text: `${marker}\n\n${transformed}`,
      map: { version: 1, replacements },
    };
  },
};

function registerBuiltinPlugins(plugins) {
  plugins.register(placeholderAnonymizer);
}

module.exports = {
  placeholderAnonymizer,
  registerBuiltinPlugins,
};

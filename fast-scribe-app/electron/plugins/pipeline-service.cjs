const { createEmptyPipeline } = require('./contracts.cjs');
const { assertValidPipeline, validatePipeline } = require('./pipeline.cjs');

const PIPELINE_STORE_KEY = 'pluginPipeline';

function createPipelineService({ store, plugins }) {
  return {
    getPipeline() {
      const pipeline = store.get(PIPELINE_STORE_KEY, createEmptyPipeline());
      assertValidPipeline(pipeline, plugins);
      return structuredClone(pipeline);
    },
    validatePipeline(pipeline) {
      const result = validatePipeline(pipeline, plugins);
      return { valid: result.valid, errors: result.errors };
    },
    savePipeline(pipeline) {
      assertValidPipeline(pipeline, plugins);
      const saved = structuredClone(pipeline);
      store.set(PIPELINE_STORE_KEY, saved);
      return structuredClone(saved);
    },
  };
}

module.exports = {
  PIPELINE_STORE_KEY,
  createPipelineService,
};

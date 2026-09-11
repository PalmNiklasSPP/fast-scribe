const {
  PIPELINE_INPUT_NODE_ID,
  PIPELINE_SCHEMA_VERSION,
  TEXT_ARTIFACT_TYPE,
  createArtifact,
  isJsonValue,
  isPlainObject,
  throwIfPipelineCancelled,
  validateConfigValue,
  PipelineExecutionError,
} = require('./contracts.cjs');

const NODE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const DESTINATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const FILENAME_TEMPLATE_PATTERN = /^(?:[^{}]|\{sourceName\})+$/;
const DESTINATION_SERIALIZERS = {
  'fast-scribe/text': 'txt',
  'fast-scribe/anonymization-map': 'json',
};

function sourceKey(source) {
  return `${source.nodeId}:${source.portId}`;
}

function validatePipeline(pipeline, plugins) {
  const errors = [];
  if (!isPlainObject(pipeline)) return { valid: false, errors: ['Pipeline must be an object.'] };
  if (pipeline.schemaVersion !== PIPELINE_SCHEMA_VERSION) {
    errors.push(`Pipeline schema version must be ${PIPELINE_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(pipeline.nodes)) errors.push('Pipeline nodes must be an array.');
  if (!Array.isArray(pipeline.connections)) errors.push('Pipeline connections must be an array.');
  if (!isPlainObject(pipeline.output)) errors.push('Pipeline output binding is required.');
  if (!isPlainObject(pipeline.layout)) errors.push('Pipeline layout must be an object.');
  if (!Array.isArray(pipeline.destinations)) errors.push('Pipeline destinations must be an array.');
  if (errors.length > 0) return { valid: false, errors };

  const nodes = new Map();
  for (const node of pipeline.nodes) {
    if (
      !isPlainObject(node) ||
      typeof node.id !== 'string' ||
      !NODE_ID_PATTERN.test(node.id) ||
      typeof node.pluginId !== 'string' ||
      typeof node.pluginVersion !== 'string' ||
      !isPlainObject(node.config) ||
      !isJsonValue(node.config)
    ) {
      errors.push('Pipeline contains an invalid node.');
      continue;
    }

    if (nodes.has(node.id)) {
      errors.push(`Pipeline node ID "${node.id}" is duplicated.`);
      continue;
    }
    const plugin = plugins.get(node.pluginId, node.pluginVersion);
    if (!plugin) {
      errors.push(`Plugin "${node.pluginId}@${node.pluginVersion}" is unavailable.`);
    } else {
      errors.push(...validateConfigValue(plugin.manifest.configSchema, node.config, `Node "${node.id}" config`));
    }
    nodes.set(node.id, { node, plugin });
  }

  for (const [nodeId, position] of Object.entries(pipeline.layout)) {
    if (
      !nodes.has(nodeId) ||
      !isPlainObject(position) ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      errors.push(`Pipeline layout position for "${nodeId}" is invalid.`);
    }
  }

  const incoming = new Map();
  const adjacency = new Map([...nodes.keys()].map((id) => [id, new Set()]));
  const sourceTypes = new Map([[`${PIPELINE_INPUT_NODE_ID}:text`, TEXT_ARTIFACT_TYPE]]);
  for (const [nodeId, { plugin }] of nodes) {
    if (!plugin) continue;
    for (const port of plugin.manifest.outputs) {
      sourceTypes.set(`${nodeId}:${port.id}`, port.type);
    }
  }

  for (const connection of pipeline.connections) {
    if (!isPlainObject(connection) || !isPlainObject(connection.from) || !isPlainObject(connection.to)) {
      errors.push('Pipeline contains an invalid connection.');
      continue;
    }
    const { from, to } = connection;
    const targetNode = nodes.get(to.nodeId);
    const targetPort = targetNode?.plugin?.manifest.inputs.find((port) => port.id === to.portId);
    const fromType = sourceTypes.get(sourceKey(from));
    const targetKey = `${to.nodeId}:${to.portId}`;

    if (!fromType) errors.push(`Connection source "${sourceKey(from)}" does not exist.`);
    if (!targetPort) errors.push(`Connection target "${targetKey}" does not exist.`);
    if (incoming.has(targetKey)) errors.push(`Input "${targetKey}" has more than one connection.`);
    if (fromType && targetPort && fromType !== targetPort.type) {
      errors.push(`Connection from "${sourceKey(from)}" to "${targetKey}" has incompatible artifact types.`);
    }
    incoming.set(targetKey, from);
    if (from.nodeId !== PIPELINE_INPUT_NODE_ID && adjacency.has(from.nodeId) && adjacency.has(to.nodeId)) {
      adjacency.get(from.nodeId).add(to.nodeId);
    }
  }

  for (const [nodeId, { plugin }] of nodes) {
    if (!plugin) continue;
    for (const input of plugin.manifest.inputs) {
      if (input.required !== false && !incoming.has(`${nodeId}:${input.id}`)) {
        errors.push(`Required input "${nodeId}:${input.id}" is not connected.`);
      }
    }
  }

  const outputType = sourceTypes.get(sourceKey(pipeline.output));
  if (!outputType) {
    errors.push(`Pipeline output "${sourceKey(pipeline.output)}" does not exist.`);
  } else if (outputType !== TEXT_ARTIFACT_TYPE) {
    errors.push('Pipeline final output must be a text artifact.');
  }

  const destinationIds = new Set();
  const destinationSources = new Set();
  for (const destination of pipeline.destinations) {
    if (
      !isPlainObject(destination) ||
      typeof destination.id !== 'string' ||
      !DESTINATION_ID_PATTERN.test(destination.id) ||
      !isPlainObject(destination.from) ||
      typeof destination.artifactType !== 'string' ||
      typeof destination.serializer !== 'string' ||
      !['settings', 'custom'].includes(destination.folderMode) ||
      typeof destination.filenameTemplate !== 'string'
    ) {
      errors.push('Pipeline contains an invalid destination.');
      continue;
    }
    if (destinationIds.has(destination.id)) {
      errors.push(`Pipeline destination ID "${destination.id}" is duplicated.`);
    }
    destinationIds.add(destination.id);
    const source = sourceKey(destination.from);
    const sourceType = sourceTypes.get(source);
    if (!sourceType) {
      errors.push(`Destination "${destination.id}" source "${source}" does not exist.`);
    } else if (sourceType !== destination.artifactType) {
      errors.push(`Destination "${destination.id}" does not match its source artifact type.`);
    }
    if (DESTINATION_SERIALIZERS[destination.artifactType] !== destination.serializer) {
      errors.push(`Destination "${destination.id}" has an unsupported serializer.`);
    }
    if (destination.folderMode === 'custom' && typeof destination.customFolder !== 'string') {
      errors.push(`Destination "${destination.id}" custom folder is required.`);
    }
    if (
      !destination.filenameTemplate.trim() ||
      !FILENAME_TEMPLATE_PATTERN.test(destination.filenameTemplate) ||
      /[\\/]/.test(destination.filenameTemplate) ||
      destination.filenameTemplate.includes('..')
    ) {
      errors.push(`Destination "${destination.id}" filename template is invalid.`);
    }
    if (destinationSources.has(source)) {
      errors.push(`Destination source "${source}" is bound more than once.`);
    }
    destinationSources.add(source);
  }

  const indegree = new Map([...nodes.keys()].map((id) => [id, 0]));
  for (const targets of adjacency.values()) {
    for (const target of targets) indegree.set(target, indegree.get(target) + 1);
  }
  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
  const topologicalOrder = [];
  while (queue.length > 0) {
    const id = queue.shift();
    topologicalOrder.push(id);
    for (const target of adjacency.get(id)) {
      const nextDegree = indegree.get(target) - 1;
      indegree.set(target, nextDegree);
      if (nextDegree === 0) queue.push(target);
    }
  }
  if (topologicalOrder.length !== nodes.size) errors.push('Pipeline graph contains a cycle.');

  return { valid: errors.length === 0, errors, topologicalOrder };
}

function assertValidPipeline(pipeline, plugins) {
  const result = validatePipeline(pipeline, plugins);
  if (!result.valid) throw new Error(`Invalid pipeline: ${result.errors.join(' ')}`);
  return result;
}

async function runPipeline({
  pipeline,
  inputText,
  plugins,
  artifactTypes,
  signal,
  onEvent = () => {},
  onArtifact = async () => {},
  createArtifactImpl = createArtifact,
}) {
  const { topologicalOrder } = assertValidPipeline(pipeline, plugins);
  throwIfPipelineCancelled(signal);
  const artifactsBySource = new Map();
  const artifacts = [];
  const inputArtifact = createArtifactImpl(
    {
      type: TEXT_ARTIFACT_TYPE,
      value: inputText,
      producer: { kind: 'pipeline-input' },
    },
    artifactTypes,
  );
  artifactsBySource.set(`${PIPELINE_INPUT_NODE_ID}:text`, inputArtifact);
  artifacts.push(inputArtifact);
  await onArtifact(inputArtifact);

  const nodes = new Map(pipeline.nodes.map((node) => [node.id, node]));
  const incoming = new Map(
    pipeline.connections.map((connection) => [
      `${connection.to.nodeId}:${connection.to.portId}`,
      connection.from,
    ]),
  );

  for (const nodeId of topologicalOrder) {
    throwIfPipelineCancelled(signal);
    const node = nodes.get(nodeId);
    const plugin = plugins.get(node.pluginId, node.pluginVersion);
    const inputs = {};
    for (const port of plugin.manifest.inputs) {
      const source = incoming.get(`${nodeId}:${port.id}`);
      if (source) inputs[port.id] = artifactsBySource.get(sourceKey(source)).value;
    }

    onEvent({ type: 'plugin_started', nodeId, pluginId: node.pluginId });
    let outputs;
    try {
      outputs = await plugin.execute({ inputs, config: node.config, signal });
      throwIfPipelineCancelled(signal);
    } catch (error) {
      if (error?.name === 'PipelineCancelledError') throw error;
      throw new PipelineExecutionError(nodeId, node.pluginId, error);
    }
    if (!isPlainObject(outputs)) {
      throw new PipelineExecutionError(nodeId, node.pluginId, new Error('Plugin outputs must be an object.'));
    }

    const declaredOutputs = new Map(plugin.manifest.outputs.map((port) => [port.id, port]));
    for (const key of Object.keys(outputs)) {
      if (!declaredOutputs.has(key)) {
        throw new PipelineExecutionError(
          nodeId,
          node.pluginId,
          new Error(`Plugin returned undeclared output "${key}".`),
        );
      }
    }
    for (const port of plugin.manifest.outputs) {
      if (!Object.hasOwn(outputs, port.id)) {
        if (port.required !== false) {
          throw new PipelineExecutionError(
            nodeId,
            node.pluginId,
            new Error(`Plugin did not return required output "${port.id}".`),
          );
        }
        continue;
      }
      let artifact;
      try {
        artifact = createArtifactImpl(
          {
            type: port.type,
            value: outputs[port.id],
            producer: {
              kind: 'plugin',
              nodeId,
              pluginId: node.pluginId,
              pluginVersion: node.pluginVersion,
              portId: port.id,
            },
          },
          artifactTypes,
        );
      } catch (error) {
        throw new PipelineExecutionError(nodeId, node.pluginId, error);
      }
      artifactsBySource.set(`${nodeId}:${port.id}`, artifact);
      artifacts.push(artifact);
      try {
        await onArtifact(artifact);
      } catch (error) {
        throw new PipelineExecutionError(nodeId, node.pluginId, error);
      }
    }
    onEvent({ type: 'plugin_completed', nodeId, pluginId: node.pluginId });
  }

  return {
    artifacts,
    inputArtifact,
    finalArtifact: artifactsBySource.get(sourceKey(pipeline.output)),
  };
}

module.exports = {
  DESTINATION_SERIALIZERS,
  assertValidPipeline,
  runPipeline,
  validatePipeline,
};

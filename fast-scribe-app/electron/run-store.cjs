const { randomUUID } = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { ARTIFACT_SCHEMA_VERSION } = require('./plugins/contracts.cjs');

const RUN_SCHEMA_VERSION = 1;
const ID_PATTERN = /^[a-f0-9-]{16,64}$/i;

function requireId(value, label) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function createRunStore({
  rootDir,
  artifactTypes,
  fsImpl = fs,
  randomUUIDImpl = randomUUID,
  nowImpl = () => new Date().toISOString(),
}) {
  if (!path.isAbsolute(rootDir)) throw new Error('Run storage requires an absolute root directory.');

  const runDirectory = (runId) => path.join(rootDir, requireId(runId, 'Run ID'));
  const manifestPath = (runId) => path.join(runDirectory(runId), 'run.json');
  const artifactPath = (runId, artifactId) => (
    path.join(runDirectory(runId), 'artifacts', `${requireId(artifactId, 'Artifact ID')}.json`)
  );

  const writeJsonAtomic = async (filePath, value) => {
    const temporaryPath = `${filePath}.${randomUUIDImpl()}.tmp`;
    await fsImpl.mkdir(path.dirname(filePath), { recursive: true });
    try {
      await fsImpl.writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
      await fsImpl.rename(temporaryPath, filePath);
    } finally {
      await fsImpl.rm(temporaryPath, { force: true });
    }
  };

  const readJson = async (filePath, label) => {
    let serialized;
    try {
      serialized = await fsImpl.readFile(filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error(`${label} was not found.`);
      throw error;
    }
    try {
      return JSON.parse(serialized);
    } catch {
      throw new Error(`${label} is corrupted.`);
    }
  };

  const readRun = async (runId) => {
    const manifest = await readJson(manifestPath(runId), 'Run');
    if (
      manifest?.schemaVersion !== RUN_SCHEMA_VERSION ||
      manifest.id !== runId ||
      !Array.isArray(manifest.artifacts)
    ) {
      throw new Error('Run manifest is corrupted.');
    }
    return manifest;
  };

  const updateRun = async (runId, updates) => {
    const allowedKeys = new Set([
      'status',
      'outputPath',
      'finalArtifactId',
      'error',
      'finishedAt',
    ]);
    if (
      !updates ||
      typeof updates !== 'object' ||
      Array.isArray(updates) ||
      Object.keys(updates).some((key) => !allowedKeys.has(key))
    ) {
      throw new Error('Run updates contain unsupported fields.');
    }
    const manifest = await readRun(runId);
    const updated = { ...manifest, ...structuredClone(updates), updatedAt: nowImpl() };
    await writeJsonAtomic(manifestPath(runId), updated);
    return updated;
  };

  return {
    async create({ sourcePath, pipeline }) {
      const id = randomUUIDImpl();
      requireId(id, 'Run ID');
      const now = nowImpl();
      const manifest = {
        schemaVersion: RUN_SCHEMA_VERSION,
        id,
        status: 'transcribing',
        source: {
          path: sourcePath,
          name: path.basename(sourcePath),
        },
        pipeline: structuredClone(pipeline),
        artifacts: [],
        createdAt: now,
        updatedAt: now,
      };
      await writeJsonAtomic(manifestPath(id), manifest);
      return manifest;
    },
    get: readRun,
    update: updateRun,
    async addArtifact(runId, artifact) {
      requireId(artifact?.id, 'Artifact ID');
      if (artifact.schemaVersion !== ARTIFACT_SCHEMA_VERSION) {
        throw new Error('Artifact schema version is unsupported.');
      }
      const typeDefinition = artifactTypes.get(artifact.type);
      if (!typeDefinition || artifact.typeVersion !== typeDefinition.schemaVersion) {
        throw new Error('Artifact type version is unsupported.');
      }
      artifactTypes.validateValue(artifact.type, artifact.value);
      const manifest = await readRun(runId);
      if (manifest.artifacts.some((entry) => entry.id === artifact.id)) {
        throw new Error(`Artifact "${artifact.id}" already exists in this run.`);
      }
      await writeJsonAtomic(artifactPath(runId, artifact.id), artifact);
      const { value: _value, ...metadata } = artifact;
      const updated = {
        ...manifest,
        artifacts: [...manifest.artifacts, metadata],
        updatedAt: nowImpl(),
      };
      await writeJsonAtomic(manifestPath(runId), updated);
      return metadata;
    },
    async readArtifact(runId, artifactId) {
      const manifest = await readRun(runId);
      if (!manifest.artifacts.some((artifact) => artifact.id === artifactId)) {
        throw new Error('Artifact is not part of this run.');
      }
      const artifact = await readJson(artifactPath(runId, artifactId), 'Artifact');
      if (
        artifact.id !== artifactId ||
        artifact.schemaVersion !== ARTIFACT_SCHEMA_VERSION ||
        artifact.typeVersion !== artifactTypes.get(artifact.type)?.schemaVersion
      ) {
        throw new Error('Artifact is corrupted.');
      }
      artifactTypes.validateValue(artifact.type, artifact.value);
      return artifact;
    },
    async list() {
      await fsImpl.mkdir(rootDir, { recursive: true });
      const entries = await fsImpl.readdir(rootDir, { withFileTypes: true });
      const manifests = [];
      for (const entry of entries) {
        if (entry.isDirectory() && ID_PATTERN.test(entry.name)) {
          manifests.push(await readRun(entry.name));
        }
      }
      return manifests.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },
  };
}

module.exports = {
  RUN_SCHEMA_VERSION,
  createRunStore,
};

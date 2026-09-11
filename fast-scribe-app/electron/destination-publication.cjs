const { randomUUID } = require('crypto');
const { constants: fsConstants } = require('fs');
const fs = require('fs/promises');
const path = require('path');
const {
  ANONYMIZATION_MAP_ARTIFACT_TYPE,
  TEXT_ARTIFACT_TYPE,
} = require('./plugins/contracts.cjs');

const SERIALIZERS = {
  [TEXT_ARTIFACT_TYPE]: {
    extension: '.txt',
    label: 'Plain text',
    serialize: (value) => {
      if (typeof value !== 'string') throw new Error('Text artifacts must contain text.');
      return value;
    },
  },
  [ANONYMIZATION_MAP_ARTIFACT_TYPE]: {
    extension: '.json',
    label: 'Replacement map JSON',
    serialize: (value) => `${JSON.stringify(value, null, 2)}\n`,
  },
};

const UNSAFE_FILENAME = /[<>:"/\\|?*]/;
const WINDOWS_RESERVED_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

class PublicationError extends Error {
  constructor(message, results, cause) {
    super(message);
    this.name = 'PublicationError';
    this.results = results;
    this.cause = cause;
  }
}

function serializerFor(type) {
  const serializer = SERIALIZERS[type];
  if (!serializer) throw new Error(`Artifacts of type "${type}" cannot be exported.`);
  return serializer;
}

function renderFilename(template, sourceName, extension) {
  if (typeof template !== 'string') throw new Error('Destination filename template is required.');
  const filename = template.replaceAll('{sourceName}', sourceName).trim();
  const hasControlCharacter = [...filename].some((character) => character.codePointAt(0) < 32);
  if (
    !filename ||
    filename === '.' ||
    filename === '..' ||
    filename.includes('..') ||
    UNSAFE_FILENAME.test(filename) ||
    hasControlCharacter ||
    /[. ]$/.test(filename) ||
    WINDOWS_RESERVED_NAME.test(filename)
  ) {
    throw new Error('Destination filename template contains an unsafe filename.');
  }
  const suppliedExtension = path.extname(filename);
  if (suppliedExtension && suppliedExtension.toLowerCase() !== extension) {
    throw new Error(`Destination filename must use the ${extension} extension.`);
  }
  return suppliedExtension ? filename : `${filename}${extension}`;
}

function resolveFolder(destination, { settingsOutputDir, sourcePath }) {
  if (destination.folderMode === 'custom') {
    if (typeof destination.customFolder !== 'string' || !path.isAbsolute(destination.customFolder)) {
      throw new Error(`Destination "${destination.id}" requires an absolute custom folder.`);
    }
    return path.resolve(destination.customFolder);
  }
  if (typeof settingsOutputDir === 'string' && settingsOutputDir.trim()) {
    if (!path.isAbsolute(settingsOutputDir)) throw new Error('Settings output folder must be absolute.');
    return path.resolve(settingsOutputDir);
  }
  return path.dirname(path.resolve(sourcePath));
}

async function pathExists(filePath, fsImpl) {
  try {
    await fsImpl.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function resolveAvailablePath(folder, filename, reserved, fsImpl) {
  const extension = path.extname(filename);
  const stem = filename.slice(0, filename.length - extension.length);
  for (let index = 1; index < 10_000; index += 1) {
    const candidateName = index === 1 ? filename : `${stem} (${index})${extension}`;
    const candidate = path.join(folder, candidateName);
    if (!reserved.has(candidate) && !await pathExists(candidate, fsImpl)) {
      reserved.add(candidate);
      return candidate;
    }
  }
  throw new Error(`Unable to find an available filename for "${filename}".`);
}

async function buildTargets({
  sourcePath,
  primaryOutputPath,
  finalArtifact,
  artifacts,
  destinations,
  settingsOutputDir,
  fsImpl = fs,
}) {
  const sourceName = path.parse(path.basename(sourcePath)).name;
  const bySource = new Map(artifacts.map((artifact) => [
    `${artifact.producer?.nodeId ?? '$input'}:${artifact.producer?.portId ?? 'text'}`,
    artifact,
  ]));
  bySource.set(
    `${finalArtifact.producer?.nodeId ?? '$input'}:${finalArtifact.producer?.portId ?? 'text'}`,
    finalArtifact,
  );
  const primaryFolder = path.dirname(path.resolve(primaryOutputPath));
  const primaryFilename = path.basename(primaryOutputPath);
  const primarySerializer = serializerFor(finalArtifact.type);
  const targets = [{
    id: 'primary',
    kind: 'primary',
    artifactId: finalArtifact.id,
    artifactType: finalArtifact.type,
    path: await resolveAvailablePath(primaryFolder, primaryFilename, new Set(), fsImpl),
    content: primarySerializer.serialize(finalArtifact.value),
  }];
  const reserved = new Set(targets.map((target) => target.path));

  for (const destination of destinations) {
    const artifact = bySource.get(`${destination.from.nodeId}:${destination.from.portId}`);
    if (!artifact) throw new Error(`Destination "${destination.id}" artifact was not produced.`);
    if (artifact.type !== destination.artifactType) {
      throw new Error(`Destination "${destination.id}" received an incompatible artifact.`);
    }
    const serializer = serializerFor(destination.artifactType);
    if (destination.serializer !== serializer.extension.slice(1)) {
      throw new Error(`Destination "${destination.id}" serializer is unsupported.`);
    }
    const folder = resolveFolder(destination, { settingsOutputDir, sourcePath });
    const filename = renderFilename(destination.filenameTemplate, sourceName, serializer.extension);
    const targetPath = await resolveAvailablePath(folder, filename, reserved, fsImpl);
    targets.push({
      id: destination.id,
      kind: 'destination',
      artifactId: artifact.id,
      artifactType: artifact.type,
      path: targetPath,
      content: serializer.serialize(artifact.value),
    });
  }
  return targets;
}

async function publishArtifacts(options, { fsImpl = fs, randomUUIDImpl = randomUUID } = {}) {
  const targets = await buildTargets({ ...options, fsImpl });
  const results = targets.map((target) => ({
    id: target.id,
    kind: target.kind,
    artifactId: target.artifactId,
    artifactType: target.artifactType,
    path: target.path,
    status: 'pending',
  }));
  const staged = [];
  const published = [];

  try {
    for (const [index, target] of targets.entries()) {
      if (options.signal?.aborted) throw new Error('Output publication was cancelled.');
      await fsImpl.mkdir(path.dirname(target.path), { recursive: true });
      await fsImpl.access(path.dirname(target.path), fsConstants.W_OK);
      const temporaryPath = path.join(
        path.dirname(target.path),
        `.${path.basename(target.path)}.${randomUUIDImpl()}.tmp`,
      );
      await fsImpl.writeFile(temporaryPath, target.content, 'utf8');
      staged.push({ ...target, temporaryPath, result: results[index] });
      results[index].status = 'staged';
    }

    for (const target of staged) {
      if (options.signal?.aborted) throw new Error('Output publication was cancelled.');
      // link() never replaces an existing destination, unlike rename() on POSIX.
      await fsImpl.link(target.temporaryPath, target.path);
      await fsImpl.rm(target.temporaryPath, { force: true });
      target.result.status = 'published';
      published.push(target);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const target of published.reverse()) {
      try {
        await fsImpl.rm(target.path);
        target.result.status = 'rolled_back';
      } catch (rollbackError) {
        target.result.status = 'rollback_failed';
        rollbackErrors.push(rollbackError);
      }
    }
    await Promise.allSettled(staged.map((target) => fsImpl.rm(target.temporaryPath, { force: true })));
    const message = rollbackErrors.length
      ? 'Output publication failed and one or more published files could not be rolled back.'
      : 'Output publication failed; no output files were published.';
    throw new PublicationError(
      message,
      results,
      rollbackErrors.length ? new AggregateError([error, ...rollbackErrors]) : error,
    );
  }

  return {
    outputPath: results[0].path,
    results,
  };
}

module.exports = {
  PublicationError,
  SERIALIZERS,
  buildTargets,
  publishArtifacts,
  renderFilename,
  resolveFolder,
  serializerFor,
};

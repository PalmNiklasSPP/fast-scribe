const { randomUUID } = require('crypto');
const fs = require('fs/promises');
const path = require('path');

function resolveTranscriptPath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('A transcript file path is required.');
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error('Transcript file paths must be absolute.');
  }
  if (path.extname(filePath).toLowerCase() !== '.txt') {
    throw new Error('Only plain-text transcript files can be opened.');
  }

  return path.normalize(filePath);
}

async function readTranscript(filePath, { fsImpl = fs } = {}) {
  return fsImpl.readFile(resolveTranscriptPath(filePath), 'utf8');
}

async function writeTranscript(
  filePath,
  content,
  { fsImpl = fs, randomUUIDImpl = randomUUID } = {},
) {
  if (typeof content !== 'string') {
    throw new Error('Transcript content must be text.');
  }

  const resolvedPath = resolveTranscriptPath(filePath);
  const temporaryPath = path.join(
    path.dirname(resolvedPath),
    `.${path.basename(resolvedPath)}.${randomUUIDImpl()}.tmp`,
  );

  try {
    await fsImpl.writeFile(temporaryPath, content, 'utf8');
    await fsImpl.rename(temporaryPath, resolvedPath);
  } finally {
    await fsImpl.rm(temporaryPath, { force: true });
  }
}

function createTranscriptFileService(dependencies = {}) {
  const allowedPaths = new Set();

  const requireAllowedPath = (filePath) => {
    const resolvedPath = resolveTranscriptPath(filePath);
    if (!allowedPaths.has(resolvedPath)) {
      throw new Error('This transcript is not available for editing.');
    }
    return resolvedPath;
  };

  return {
    allow(filePath) {
      allowedPaths.add(resolveTranscriptPath(filePath));
    },
    read(filePath) {
      return readTranscript(requireAllowedPath(filePath), dependencies);
    },
    write(filePath, content) {
      return writeTranscript(requireAllowedPath(filePath), content, dependencies);
    },
  };
}

module.exports = {
  createTranscriptFileService,
  readTranscript,
  resolveTranscriptPath,
  writeTranscript,
};

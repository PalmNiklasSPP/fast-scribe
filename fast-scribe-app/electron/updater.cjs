const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function createUpdateController({
  autoUpdater,
  currentVersion,
  isPackaged,
  sendState,
  setIntervalImpl = setInterval,
}) {
  let initialized = false;
  let checkTimer;
  let state = {
    status: isPackaged ? 'idle' : 'disabled',
    currentVersion,
  };

  const publishState = (updates) => {
    state = { ...state, ...updates };
    sendState({ ...state });
  };

  const setError = (error) => {
    publishState({
      status: 'error',
      error: errorMessage(error),
      progress: undefined,
    });
  };

  const check = async () => {
    if (
      !isPackaged ||
      state.status === 'checking' ||
      state.status === 'downloading' ||
      state.status === 'downloaded'
    ) {
      return { ...state };
    }

    publishState({ status: 'checking', error: undefined });
    try {
      await autoUpdater.checkForUpdates();
      return { ...state };
    } catch (error) {
      setError(error);
      throw error;
    }
  };

  const initialize = async () => {
    if (initialized || !isPackaged) return { ...state };
    initialized = true;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      publishState({ status: 'checking', error: undefined });
    });
    autoUpdater.on('update-available', (info) => {
      publishState({
        status: 'available',
        version: info.version,
        error: undefined,
        progress: undefined,
      });
    });
    autoUpdater.on('update-not-available', () => {
      publishState({
        status: 'idle',
        version: undefined,
        error: undefined,
        progress: undefined,
      });
    });
    autoUpdater.on('download-progress', (progress) => {
      publishState({
        status: 'downloading',
        progress: Math.round(progress.percent),
        error: undefined,
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      publishState({
        status: 'downloaded',
        version: info.version,
        progress: 100,
        error: undefined,
      });
    });
    autoUpdater.on('error', setError);

    checkTimer = setIntervalImpl(() => {
      check().catch(() => {});
    }, CHECK_INTERVAL_MS);
    checkTimer.unref?.();

    return check();
  };

  const download = async () => {
    if (state.status !== 'available') {
      throw new Error('No update is available to download.');
    }

    publishState({ status: 'downloading', progress: 0, error: undefined });
    try {
      await autoUpdater.downloadUpdate();
      return { ...state };
    } catch (error) {
      setError(error);
      throw error;
    }
  };

  const install = () => {
    if (state.status !== 'downloaded') {
      throw new Error('The update has not finished downloading.');
    }
    autoUpdater.quitAndInstall(false, true);
  };

  const dispose = () => {
    if (checkTimer) clearInterval(checkTimer);
  };

  return {
    check,
    dispose,
    download,
    getState: () => ({ ...state }),
    initialize,
    install,
  };
}

module.exports = {
  CHECK_INTERVAL_MS,
  createUpdateController,
};

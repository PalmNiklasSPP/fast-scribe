const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const { CHECK_INTERVAL_MS, createUpdateController } = require('./updater.cjs');

class FakeAutoUpdater extends EventEmitter {
  async checkForUpdates() {
    this.emit('checking-for-update');
    this.emit('update-available', { version: '1.1.0' });
  }

  async downloadUpdate() {
    this.emit('download-progress', { percent: 42.4 });
    this.emit('update-downloaded', { version: '1.1.0' });
  }

  quitAndInstall(isSilent, forceRunAfter) {
    this.installArgs = [isSilent, forceRunAfter];
  }
}

test('packaged apps check on launch and periodically', async () => {
  const autoUpdater = new FakeAutoUpdater();
  const states = [];
  let timer;
  let interval;
  const controller = createUpdateController({
    autoUpdater,
    currentVersion: '1.0.0',
    isPackaged: true,
    sendState: (state) => states.push(state),
    setIntervalImpl: (callback, delay) => {
      timer = callback;
      interval = delay;
      return { unref() {} };
    },
  });

  await controller.initialize();

  assert.equal(interval, CHECK_INTERVAL_MS);
  assert.equal(controller.getState().status, 'available');
  assert.equal(controller.getState().version, '1.1.0');
  assert.equal(states.at(-1).currentVersion, '1.0.0');

  await timer();
  assert.equal(controller.getState().status, 'available');
});

test('downloads an available update and installs it on request', async () => {
  const autoUpdater = new FakeAutoUpdater();
  const controller = createUpdateController({
    autoUpdater,
    currentVersion: '1.0.0',
    isPackaged: true,
    sendState: () => {},
    setIntervalImpl: () => ({ unref() {} }),
  });

  await controller.initialize();
  await controller.download();

  assert.deepEqual(controller.getState(), {
    status: 'downloaded',
    currentVersion: '1.0.0',
    version: '1.1.0',
    error: undefined,
    progress: 100,
  });

  controller.install();
  assert.deepEqual(autoUpdater.installArgs, [false, true]);
});

test('development builds keep updates disabled', async () => {
  const autoUpdater = new FakeAutoUpdater();
  autoUpdater.checkForUpdates = () => {
    throw new Error('Updates must not be checked in development.');
  };
  const controller = createUpdateController({
    autoUpdater,
    currentVersion: '1.0.0',
    isPackaged: false,
    sendState: () => {},
  });

  await controller.initialize();

  assert.deepEqual(controller.getState(), {
    status: 'disabled',
    currentVersion: '1.0.0',
  });
});

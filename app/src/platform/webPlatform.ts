/**
 * Web platform stub.
 *
 * Satisfies the `Platform` interface for browser-only mode (Vite dev server,
 * `vite preview`, static deploys). All Tauri-specific surfaces are no-ops or
 * return safe defaults; the rest of the app branches on
 * `platform.metadata.isTauri` to disable them.
 */
import type {
  AudioDevice,
  Platform,
  PlatformAudio,
  PlatformFilesystem,
  PlatformLifecycle,
  PlatformMetadata,
  PlatformUpdater,
  ServerLogEntry,
  UpdateStatus,
} from './types';

const noopUpdateStatus: UpdateStatus = {
  checking: false,
  available: false,
  downloading: false,
  installing: false,
  readyToInstall: false,
};

const webFilesystem: PlatformFilesystem = {
  async saveFile() {
    throw new Error('File saving is not supported in the web build');
  },
  async openPath() {
    throw new Error('Opening local paths is not supported in the web build');
  },
  async pickDirectory() {
    return null;
  },
};

const webUpdater: PlatformUpdater = {
  async checkForUpdates() {
    /* no-op */
  },
  async downloadAndInstall() {
    throw new Error('Auto-update is not supported in the web build');
  },
  async restartAndInstall() {
    throw new Error('Auto-update is not supported in the web build');
  },
  getStatus() {
    return noopUpdateStatus;
  },
  subscribe() {
    return () => {};
  },
};

const webAudio: PlatformAudio = {
  async isSystemAudioSupported() {
    return false;
  },
  async startSystemAudioCapture() {
    throw new Error('System audio capture is not supported in the web build');
  },
  async stopSystemAudioCapture() {
    throw new Error('System audio capture is not supported in the web build');
  },
  async listOutputDevices(): Promise<AudioDevice[]> {
    return [];
  },
  async playToDevices() {
    /* no-op */
  },
  stopPlayback() {
    /* no-op */
  },
};

const webLifecycle: PlatformLifecycle = {
  async startServer() {
    throw new Error('Server lifecycle is not managed in the web build');
  },
  async stopServer() {
    /* no-op */
  },
  async restartServer() {
    throw new Error('Server lifecycle is not managed in the web build');
  },
  async setKeepServerRunning() {
    /* no-op */
  },
  async setupWindowCloseHandler() {
    /* no-op */
  },
  subscribeToServerLogs(_callback: (entry: ServerLogEntry) => void) {
    return () => {};
  },
};

const webMetadata: PlatformMetadata = {
  async getVersion() {
    return 'web';
  },
  isTauri: false,
};

export const webPlatform: Platform = {
  filesystem: webFilesystem,
  updater: webUpdater,
  audio: webAudio,
  lifecycle: webLifecycle,
  metadata: webMetadata,
};

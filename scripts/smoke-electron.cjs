const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');

// Remove the isolated profile after Chromium releases its Windows file locks.
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ciby-electron-'));
  try {
    const result = spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], {
      stdio: 'inherit', env: { ...process.env, CIBY_SMOKE_PROFILE: profile }
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  return;
}

const { app, BrowserWindow, session } = require('electron');
app.setPath('userData', process.env.CIBY_SMOKE_PROFILE);
app.disableHardwareAcceleration();
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] },
    (_details, callback) => callback({ cancel: true }));
});

async function smoke() {
  const windowCreated = once(app, 'browser-window-created');
  const source = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
  require(path.join(source, 'main.js'));
  const [, win] = await windowCreated;
  const contents = win.webContents;
  const errors = [];
  contents.on('preload-error', (_event, _file, error) => errors.push(error.message));
  win.hide();
  await once(contents, 'did-finish-load');
  const prefs = contents.getLastWebPreferences();
  assert.ok(prefs.sandbox && prefs.contextIsolation && !prefs.nodeIntegration);
  const result = await contents.executeJavaScript(`(async () => ({
    title: document.title,
    node: typeof require,
    invalid: await window.electronAPI.getMediaInfo('invalid'),
    format: await window.electronAPI.downloadMedia('unsupported'),
    noMedia: await window.electronAPI.downloadMedia('mp3'),
    noCover: await window.electronAPI.chooseCover(),
    idleCancel: await window.electronAPI.cancelDownload(),
    cancelButton: Boolean(document.getElementById('btn-cancel'))
  }))()`);
  assert.equal(result.title, 'CIBY');
  assert.equal(result.node, 'undefined');
  assert.match(result.invalid.error, /supported HTTPS/);
  assert.match(result.format.error, /Choose MP4/);
  assert.match(result.noMedia.error, /Analyze/);
  assert.match(result.noCover.error, /Analyze/);
  assert.equal(result.idleCancel.canceled, false);
  assert.ok(result.cancelButton);
  assert.deepEqual(errors, []);

  const other = new BrowserWindow({ show: false, webPreferences: {
    sandbox: true, preload: path.join(source, 'preload.js')
  } });
  await other.loadFile(path.join(source, 'index.html'));
  const denied = await other.webContents.executeJavaScript("window.electronAPI.downloadMedia('mp3')");
  assert.equal(denied.error, 'Unauthorized request.');
  other.destroy();
  console.log('Electron smoke passed: isolated renderer, preload, authorized IPC and foreign-window rejection.');
}

const timeout = setTimeout(() => { console.error('Electron smoke timed out.'); app.exit(1); }, 20000);
smoke().then(() => { clearTimeout(timeout); app.exit(0); }, error => {
  clearTimeout(timeout);
  console.error(error);
  app.exit(1);
});

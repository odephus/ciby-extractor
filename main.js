const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { autoUpdater } = require('electron-updater');
const { MediaJobs, saveMedia } = require('./download');
const { validateFormat, readCover } = require('./validation');
const { analyze } = require('./media-info');
const { extractMedia } = require('./media-process');

const indexPath = path.join(__dirname, 'index.html');
const indexUrl = pathToFileURL(indexPath).href;
const jobs = new MediaJobs();
let mainWindow, media, cover;

function trusted(event) {
  return mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents &&
    event.senderFrame && event.senderFrame === event.sender.mainFrame && event.senderFrame.url === indexUrl;
}

function handle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) return { error: 'Unauthorized request.' };
    return handler(...args);
  });
}

function resetDocument() {
  jobs.cancel();
  media = null;
  cover = null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 900, height: 800, frame: false, transparent: true, resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), nodeIntegration: false,
      contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false
    }
  });
  mainWindow = win;
  const contents = win.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', event => event.preventDefault());
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  contents.session.setPermissionCheckHandler(() => false);
  contents.on('render-process-gone', resetDocument);
  contents.on('did-start-navigation', ({ isSameDocument, isMainFrame }) => {
    if (isMainFrame && !isSameDocument) resetDocument();
  });
  let closing = false;
  win.on('close', event => {
    if (!jobs.current) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    jobs.cancel();
    jobs.current.done.finally(() => { if (!win.isDestroyed()) win.close(); });
  });
  win.on('closed', () => { resetDocument(); mainWindow = null; });
  win.loadFile(indexPath);
}

function updateMessage(message) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-message', message);
}

async function checkUpdates() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  try {
    // The NSIS updater skips Authenticode verification without publisherName.
    // Read the same packaged configuration it uses to verify the installer.
    const { publisherName } = await autoUpdater.configOnDisk.value;
    if (![publisherName].flat().some(name => typeof name === 'string' && name.trim())) return;
    autoUpdater.on('error', () => updateMessage('UPDATE CHECK OR DOWNLOAD FAILED.'));
    autoUpdater.on('update-available', () => updateMessage('GÜNCELLEME BULUNDU, İNDİRİLİYOR...'));
    autoUpdater.on('update-downloaded', () => updateMessage('GÜNCELLEME HAZIR. UYGULAMA KAPATILDIĞINDA YÜKLENECEK.'));
    await autoUpdater.checkForUpdates();
  } catch { updateMessage('UPDATE CHECK FAILED.'); }
}

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.whenReady().then(() => {
    createWindow();
    checkUpdates();
    app.on('activate', () => { if (!mainWindow) createWindow(); });
  });
} else {
  app.quit();
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.on('window-control', (event, action) => {
  if (!trusted(event)) return;
  if (action === 'minimize') mainWindow.minimize();
  if (action === 'close') mainWindow.close();
});

handle('get-media-info', url => jobs.run('analysis', async ({ controller }) => {
  media = cover = null;
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]);
  const result = await analyze(url, signal);
  signal.throwIfAborted();
  media = result;
  const { title, thumbnail, duration, isSpotify } = media;
  return { title, thumbnail, duration, isSpotify };
}));

handle('choose-cover', () => jobs.run('cover', async ({ controller }) => {
  if (!media) throw new Error('Analyze a media link first.');
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select MP3 artwork', properties: ['openFile'],
    filters: [{ name: 'Artwork', extensions: ['png', 'jpg', 'jpeg'] }]
  });
  if (canceled) return { canceled: true };
  controller.signal.throwIfAborted();
  const selected = await readCover(filePaths[0]);
  controller.signal.throwIfAborted();
  cover = selected;
  return { success: true };
}));

handle('download-media', format => jobs.run('download', async job => {
  validateFormat(format);
  if (!media) throw new Error('Analyze a media link first.');
  const selection = { ...media, format, cover: format === 'mp3' ? cover : null };
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save File', defaultPath: path.join(app.getPath('downloads'), 'download.' + format),
    filters: [{ name: 'Media', extensions: [format] }],
    properties: ['showOverwriteConfirmation']
  });
  if (canceled || !filePath) return { canceled: true };
  return saveMedia(job, filePath, format, (dir, signal) =>
    extractMedia(selection, dir, signal, progress => {
      if (!signal.aborted && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('download-progress', progress);
    }));
}));

handle('cancel-download', () => ({ canceled: jobs.cancel('download') }));

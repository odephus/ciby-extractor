const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const ytDlpExec = require('yt-dlp-exec');
const ffmpegStatic = require('ffmpeg-static');
const { autoUpdater } = require('electron-updater');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args)).catch(() => globalThis.fetch(...args));
const spotifyUrlInfo = require('spotify-url-info')(globalThis.fetch);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 800,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', () => {
    if (mainWindow) mainWindow.webContents.send('update-message', 'GÜNCELLEME BULUNDU, İNDİRİLİYOR...');
  });
  
  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) mainWindow.webContents.send('update-message', 'GÜNCELLEME HAZIR, YENİDEN BAŞLATILIYOR...');
    setTimeout(() => {
      autoUpdater.quitAndInstall();
    }, 3000);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('window-control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (action === 'minimize') win.minimize();
  if (action === 'close') win.close();
});

async function getSpotifyTrackQuery(url) {
  try {
    const data = await spotifyUrlInfo.getPreview(url);
    if (data && data.title && data.artist) {
        return `${data.artist} - ${data.title}`;
    }
    return null;
  } catch(e) {
    return null;
  }
}

ipcMain.handle('get-media-info', async (event, url) => {
    try {
        let fetchUrl = url;
        let isSpotify = url.includes('spotify.com');
        let titleOverride = null;

        if (isSpotify) {
            const query = await getSpotifyTrackQuery(url);
            if (!query) throw new Error("Could not extract Spotify track info.");
            fetchUrl = `ytsearch1:${query}`;
            titleOverride = query;
        }

        const info = await ytDlpExec(fetchUrl, {
            dumpJson: true,
            noWarnings: true,
            noCallHome: true,
            noCheckCertificate: true,
        });

        let finalInfo = info;
        if (info._type === 'playlist' && info.entries && info.entries.length > 0) {
            finalInfo = info.entries[0];
        }

        return {
            title: titleOverride || finalInfo.title,
            thumbnail: finalInfo.thumbnail,
            duration: finalInfo.duration_string || finalInfo.duration,
            isSpotify
        };
    } catch (error) {
        return { error: error.message };
    }
});

const NodeID3 = require('node-id3');

ipcMain.handle('download-media', async (event, { url, format, customCoverPath, title, thumbnailUrl }) => {
    try {
        let targetUrl = url;
        let isSpotify = url.includes('spotify.com');

        if (isSpotify) {
            const query = await getSpotifyTrackQuery(url);
            if (!query) throw new Error("Could not extract Spotify track info.");
            targetUrl = `ytsearch1:${query}`;
        }

        const defaultExtension = format === 'mp4' ? 'mp4' : format; // format is mp4, mp3, flac, wav
        const defaultPath = path.join(os.homedir(), 'Downloads', `download.${defaultExtension}`);
        
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Save File',
            defaultPath: defaultPath,
            filters: [
                { name: 'Media', extensions: [defaultExtension] }
            ]
        });

        if (canceled || !filePath) {
            return { canceled: true };
        }

        let args = {
            noWarnings: true,
            noCallHome: true,
            noCheckCertificate: true,
            output: filePath,
            ffmpegLocation: ffmpegStatic.includes('app.asar') ? ffmpegStatic.replace('app.asar', 'app.asar.unpacked') : ffmpegStatic
        };

        if (format !== 'mp4') {
            args.extractAudio = true;
            args.audioFormat = format;
            if (format === 'mp3') {
                args.audioQuality = 0;
            }
            if (!customCoverPath) {
                args.embedThumbnail = true;
                args.addMetadata = true;
            }
        } else {
            args.format = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
            args.mergeOutputFormat = 'mp4';
        }

        const downloader = ytDlpExec.exec(targetUrl, args);
        
        downloader.stdout.on('data', (data) => {
            const output = data.toString();
            const percentMatch = output.match(/\[download\]\s+([\d\.]+)%/);
            if (percentMatch && percentMatch[1]) {
                const percent = parseFloat(percentMatch[1]);
                event.sender.send('download-progress', percent);
            }
        });

        await downloader;

        // Custom Cover Injection for MP3
        if (customCoverPath && format === 'mp3') {
            try {
                const tags = {
                    title: title,
                    artist: isSpotify ? title.split('-')[0].trim() : 'Unknown',
                    image: customCoverPath
                };
                NodeID3.update(tags, filePath);
            } catch (err) {
                console.error("Cover injection failed:", err);
            }
        }

        return { success: true, filePath };

    } catch (error) {
        return { error: error.message };
    }
});

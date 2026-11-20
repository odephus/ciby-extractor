const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    windowControl: (action) => ipcRenderer.send('window-control', action),
    getMediaInfo: (url) => ipcRenderer.invoke('get-media-info', url),
    downloadMedia: (format) => ipcRenderer.invoke('download-media', format),
    chooseCover: () => ipcRenderer.invoke('choose-cover'),
    cancelDownload: () => ipcRenderer.invoke('cancel-download'),
    onDownloadProgress: (callback) => { ipcRenderer.on('download-progress', (_event, value) => callback(value)); },
    onUpdateMessage: (callback) => { ipcRenderer.on('update-message', (_event, value) => callback(value)); }
});

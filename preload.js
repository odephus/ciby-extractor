const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    windowControl: (action) => ipcRenderer.send('window-control', action),
    getMediaInfo: (url) => ipcRenderer.invoke('get-media-info', url),
    downloadMedia: (data) => ipcRenderer.invoke('download-media', data),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_event, value) => callback(value)),
    onUpdateMessage: (callback) => ipcRenderer.on('update-message', (_event, value) => callback(value))
});

document.getElementById('btn-minimize').addEventListener('click', () => {
    window.electronAPI.windowControl('minimize');
});

document.getElementById('btn-close').addEventListener('click', () => {
    window.electronAPI.windowControl('close');
});

const urlInput = document.getElementById('url-input');
const btnAnalyze = document.getElementById('btn-analyze');
const btnDownload = document.getElementById('btn-download');
const mediaPanel = document.getElementById('media-panel');
const progressPanel = document.getElementById('progress-panel');
const mediaThumbnail = document.getElementById('media-thumbnail');
const mediaTitle = document.getElementById('media-title');
const mediaStatus = document.getElementById('media-status');
const progressBar = document.getElementById('progress-bar');
const progressPercent = document.getElementById('progress-percent');
const progressText = document.getElementById('progress-text');
const systemLog = document.getElementById('system-log');

let currentMediaUrl = '';

function logSystem(msg) {
    systemLog.innerText = `> ${msg}`;
}

btnAnalyze.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
        logSystem('ERROR: NO TARGET URL PROVIDED');
        return;
    }

    logSystem('INITIALIZING CONNECTION TO TARGET...');
    
    mediaPanel.classList.add('hidden');
    progressPanel.classList.add('hidden');
    btnDownload.classList.add('hidden');
    btnAnalyze.disabled = true;
    btnAnalyze.querySelector('.btn-text').innerText = 'ANALYZING...';

    try {
        const info = await window.electronAPI.getMediaInfo(url);
        
        if (info.error) {
            throw new Error(info.error);
        }

        currentMediaUrl = url;
        mediaTitle.innerText = info.title || 'UNKNOWN ENTITY';
        mediaThumbnail.src = info.thumbnail || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        mediaStatus.innerText = info.isSpotify ? 'SPOTIFY TARGET ACQUIRED' : 'TARGET ACQUIRED';
        
        mediaPanel.classList.remove('hidden');
        btnDownload.classList.remove('hidden');
        logSystem('TARGET ACQUIRED SUCCESSFULLY.');
    } catch (err) {
        logSystem(`ERROR: ${err.message.substring(0, 50).toUpperCase()}`);
    } finally {
        btnAnalyze.disabled = false;
        btnAnalyze.querySelector('.btn-text').innerText = 'INITIALIZE EXTRACTION';
    }
});

btnDownload.addEventListener('click', async () => {
    if (!currentMediaUrl) return;

    const isMp3 = document.getElementById('format-mp3').checked;
    const format = isMp3 ? 'mp3' : 'mp4';

    logSystem(`COMMENCING ${format.toUpperCase()} EXTRACTION...`);
    
    btnDownload.classList.add('hidden');
    progressPanel.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressPercent.innerText = '0%';
    progressText.innerText = 'EXTRACTING...';

    window.electronAPI.onDownloadProgress((percent) => {
        progressBar.style.width = `${percent}%`;
        progressPercent.innerText = `${percent.toFixed(1)}%`;
        if (percent > 0 && percent < 100) {
            progressText.innerText = 'DOWNLOADING...';
            logSystem(`DOWNLOADING... ${percent.toFixed(1)}%`);
        }
    });

    try {
        const result = await window.electronAPI.downloadMedia({
            url: currentMediaUrl,
            format: format
        });

        if (result.canceled) {
            logSystem('OPERATION ABORTED BY USER.');
            progressPanel.classList.add('hidden');
            btnDownload.classList.remove('hidden');
            return;
        }

        if (result.error) {
            throw new Error(result.error);
        }

        progressText.innerText = 'EXTRACTION COMPLETE';
        progressBar.style.width = '100%';
        progressPercent.innerText = '100%';
        logSystem(`SUCCESS. SAVED TO: ${result.filePath}`);
        
        setTimeout(() => {
            progressPanel.classList.add('hidden');
            btnDownload.classList.remove('hidden');
            btnDownload.querySelector('.btn-text').innerText = 'EXECUTE AGAIN';
        }, 3000);

    } catch (err) {
        progressText.innerText = 'ERROR';
        logSystem(`ERROR: ${err.message.substring(0, 50).toUpperCase()}`);
        setTimeout(() => {
            progressPanel.classList.add('hidden');
            btnDownload.classList.remove('hidden');
        }, 3000);
    }
});

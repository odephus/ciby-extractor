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

const formatToggleVideo = document.getElementById('format-mp4');
const formatToggleAudio = document.getElementById('format-mp3');
const audioQualitySelector = document.getElementById('audio-quality-selector');
const audioQualityDrop = document.getElementById('audio-quality');

const btnCustomCover = document.getElementById('btn-custom-cover');
const btnCancel = document.getElementById('btn-cancel');
const customCoverSection = document.getElementById('custom-cover-section');

let currentMediaUrl = '';
let currentMediaTitle = '';
let downloading = false;

function setBusy(busy) {
    for (const control of [urlInput, btnAnalyze, btnDownload, btnCustomCover, formatToggleVideo, formatToggleAudio, audioQualityDrop]) {
        control.disabled = busy;
    }
}

function logSystem(msg) {
    systemLog.innerText = `> ${msg}`;
}

window.electronAPI.onUpdateMessage((msg) => {
    logSystem(msg);
});

formatToggleVideo.addEventListener('change', () => {
    audioQualitySelector.classList.add('hidden');
    customCoverSection.classList.add('hidden');
});

formatToggleAudio.addEventListener('change', () => {
    audioQualitySelector.classList.remove('hidden');
    if (!mediaPanel.classList.contains('hidden') && audioQualityDrop.value === 'mp3') {
        customCoverSection.classList.remove('hidden');
    }
});

audioQualityDrop.addEventListener('change', () => {
    customCoverSection.classList.toggle('hidden', mediaPanel.classList.contains('hidden') || audioQualityDrop.value !== 'mp3');
});

btnCustomCover.addEventListener('click', async () => {
    setBusy(true);
    try {
        const result = await window.electronAPI.chooseCover();
        if (result.error) throw new Error(result.error);
        if (result.canceled) return;
        btnCustomCover.innerHTML = '<i class="fa-solid fa-check"></i> COVER LOADED';
        btnCustomCover.style.color = '#0f0';
        btnCustomCover.style.borderColor = '#0f0';
        logSystem('CUSTOM COVER LOADED IN MEMORY.');
    } catch (err) {
        logSystem(`ERROR: ${err.message}`);
    } finally {
        setBusy(false);
    }
});

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
    customCoverSection.classList.add('hidden');
    setBusy(true);
    btnAnalyze.querySelector('.btn-text').innerText = 'ANALYZING...';

    currentMediaUrl = '';
    btnCustomCover.innerHTML = '<i class="fa-solid fa-image"></i> INJECT CUSTOM COVER';
    btnCustomCover.style.color = '';
    btnCustomCover.style.borderColor = '';

    try {
        const info = await window.electronAPI.getMediaInfo(url);
        
        if (info.error) {
            throw new Error(info.error);
        }

        currentMediaUrl = url;
        currentMediaTitle = info.title || 'UNKNOWN ENTITY';
        mediaTitle.innerText = currentMediaTitle;
        mediaThumbnail.src = info.thumbnail || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        mediaStatus.innerText = info.isSpotify ? 'SPOTIFY TARGET ACQUIRED' : 'TARGET ACQUIRED';
        
        mediaPanel.classList.remove('hidden');
        btnDownload.classList.remove('hidden');
        if (formatToggleAudio.checked && audioQualityDrop.value === 'mp3') {
            customCoverSection.classList.remove('hidden');
        }
        logSystem('TARGET ACQUIRED SUCCESSFULLY.');
    } catch (err) {
        logSystem(`ERROR: ${err.message}`);
    } finally {
        setBusy(false);
        btnAnalyze.querySelector('.btn-text').innerText = 'INITIALIZE EXTRACTION';
    }
});

window.electronAPI.onDownloadProgress(({ phase, percent }) => {
    if (!downloading || btnCancel.disabled) return;
    progressText.innerText = phase === 'processing' ? 'PROCESSING...' : 'DOWNLOADING STREAM...';
    progressPercent.innerText = Number.isFinite(percent) ? `${percent.toFixed(1)}%` : '';
    progressBar.style.width = Number.isFinite(percent) ? `${percent}%` : '0%';
});

btnCancel.addEventListener('click', async () => {
    btnCancel.disabled = true;
    progressText.innerText = 'CANCELLING...';
    try {
        await window.electronAPI.cancelDownload();
    } catch (err) {
        logSystem(`ERROR: ${err.message}`);
        btnCancel.disabled = false;
    }
});

btnDownload.addEventListener('click', async () => {
    if (!currentMediaUrl) return;

    let format = 'mp4';
    if (formatToggleAudio.checked) {
        format = audioQualityDrop.value; // 'mp3', 'flac', or 'wav'
    }

    logSystem(`COMMENCING ${format.toUpperCase()} EXTRACTION...`);
    downloading = true;
    setBusy(true);
    btnCancel.disabled = false;
    btnCancel.classList.remove('hidden');
    
    btnDownload.classList.add('hidden');
    progressPanel.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressPercent.innerText = '0%';
    progressText.innerText = 'EXTRACTING...';

    try {
        const result = await window.electronAPI.downloadMedia(format);

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
        
        btnDownload.querySelector('.btn-text').innerText = 'EXECUTE AGAIN';

    } catch (err) {
        progressText.innerText = 'ERROR';
        logSystem(`ERROR: ${err.message}`);
    } finally {
        downloading = false;
        btnCancel.classList.add('hidden');
        btnDownload.classList.remove('hidden');
        setBusy(false);
    }
});

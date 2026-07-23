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
const customCoverInput = document.getElementById('custom-cover-input');
const customCoverSection = document.getElementById('custom-cover-section');

let currentMediaUrl = '';
let currentCustomCoverPath = null;
let currentMediaTitle = '';

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
    if (mediaPanel.classList.contains('hidden') === false) {
        customCoverSection.classList.remove('hidden');
    }
});

btnCustomCover.addEventListener('click', () => {
    customCoverInput.click();
});

customCoverInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
        currentCustomCoverPath = e.target.files[0].path;
        btnCustomCover.innerHTML = '<i class="fa-solid fa-check"></i> COVER LOADED';
        btnCustomCover.style.color = '#0f0';
        btnCustomCover.style.borderColor = '#0f0';
        logSystem('CUSTOM COVER LOADED IN MEMORY.');
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
    btnAnalyze.disabled = true;
    btnAnalyze.querySelector('.btn-text').innerText = 'ANALYZING...';

    currentCustomCoverPath = null;
    customCoverInput.value = '';
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
        if (formatToggleAudio.checked) {
            customCoverSection.classList.remove('hidden');
        }
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

    let format = 'mp4';
    if (formatToggleAudio.checked) {
        format = audioQualityDrop.value; // 'mp3', 'flac', or 'wav'
    }

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
            format: format,
            customCoverPath: currentCustomCoverPath,
            title: currentMediaTitle,
            thumbnailUrl: mediaThumbnail.src
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

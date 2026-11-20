const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const { validateFormat } = require('./validation');

function toolPath(moduleName, executable) {
  const moduleDir = path.dirname(require.resolve(moduleName + '/package.json'));
  const file = path.join(moduleDir, executable + (process.platform === 'win32' ? '.exe' : ''));
  return file.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
}

const ytDlp = toolPath('yt-dlp-exec', 'bin/yt-dlp');
const ffmpeg = toolPath('ffmpeg-static', 'ffmpeg');

function stopTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  if (process.platform !== 'win32') {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    return Promise.resolve();
  }
  // The Windows yt-dlp launcher can own both a Python worker and FFmpeg.
  return new Promise(resolve => {
    const killer = spawn(path.win32.join(process.env.SystemRoot, 'System32', 'taskkill.exe'),
      ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => child.kill());
    killer.on('close', code => { if (code) child.kill(); resolve(); });
  });
}

function mediaError(name, code, stderr) {
  const lines = stderr.trim().split(/[\r\n]+/);
  const details = lines.filter(line => /^ERROR:/i.test(line.trim())).slice(-3).join('\n') ||
    lines.slice(-3).join('\n');
  return new Error(name + ' failed (' + code + ').' + (details ? '\n' + details.slice(-2000) : ''));
}

function runTool(executable, args, { cwd, signal, onLine } = {}) {
  signal?.throwIfAborted();
  const name = path.basename(executable);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd, shell: false, windowsHide: true, detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '', pending = '', failure, stopping;
    const stop = () => { stopping ??= stopTree(child); };
    signal?.addEventListener('abort', stop, { once: true });
    child.stderr.setEncoding('utf8').on('data', text => { stderr = (stderr + text).slice(-8192); });
    child.stdout.setEncoding('utf8').on('data', text => {
      if (!onLine || failure || signal?.aborted) return;
      const lines = (pending + text).split('\n');
      pending = lines.pop();
      try {
        if (pending.length > 128 * 1024) throw new Error(name + ' returned an oversized response.');
        for (const line of lines) onLine(line.trimEnd());
      } catch (error) { failure = error; stop(); }
    });
    child.on('error', error => {
      failure = new Error(error.code === 'ENOENT' ? name + ' is missing. Reinstall the application.' :
        'Could not run ' + name + ': ' + error.message);
    });
    child.on('close', async (code, exitSignal) => {
      signal?.removeEventListener('abort', stop);
      try {
        await stopping;
        signal?.throwIfAborted();
        if (failure) throw failure;
        if (code !== 0) throw mediaError(name, exitSignal || code, stderr);
        if (pending) onLine(pending.trimEnd());
        resolve();
      } catch (error) { reject(error); }
    });
  });
}

const common = ['--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--no-remote-components',
  '--no-playlist', '--playlist-items', '1', '--socket-timeout', '25', '--color', 'never', '--encoding', 'utf-8',
  '--use-extractors', 'youtube,youtube:search,youtube:tab,youtube:playlist,soundcloud,soundcloud:set',
  '--ffmpeg-location', ffmpeg];

async function inspectMedia(target, signal) {
  let info;
  await runTool(ytDlp, [...common, '--simulate', '--print',
    '%(.{title,thumbnail,duration_string,duration,webpage_url})j', '--', target], {
    signal,
    onLine(line) {
      if (line) {
        try { info = JSON.parse(line); } catch { throw new Error('yt-dlp returned invalid metadata.'); }
      }
    }
  });
  if (!info || typeof info.title !== 'string' || !info.title.trim()) throw new Error('No matching media found.');
  return info;
}

function downloadArgs(target, format, cover) {
  validateFormat(format);
  const args = [...common, '--newline', '--progress', '--progress-delta', '0.25',
    '--progress-template', 'download:CIBY_BYTES %(progress.downloaded_bytes)s %(progress.total_bytes,progress.total_bytes_estimate)s',
    '--progress-template', 'postprocess:CIBY_PROCESS', '-o', 'media.%(ext)s'];
  if (format === 'mp4') {
    args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', '--merge-output-format', 'mp4', '--remux-video', 'mp4');
  } else {
    args.push('-x', '--audio-format', format, '--add-metadata');
    if (format === 'mp3') args.push('--audio-quality', '320K');
    if (format !== 'wav' && !cover) args.push('--embed-thumbnail');
  }
  return [...args, '--', target];
}

function progressLine(line) {
  if (line === 'CIBY_PROCESS') return { phase: 'processing' };
  const match = /^CIBY_BYTES (\d+|NA) (\d+|NA)$/.exec(line);
  if (!match) return null;
  const ratio = Number(match[1]) / Number(match[2]);
  return { phase: 'download', percent: Number.isFinite(ratio) ? Math.min(100, ratio * 100) : null };
}

async function extractMedia({ target, format, cover, title, artist }, cwd, signal, report) {
  await runTool(ytDlp, downloadArgs(target, format, cover), { cwd, signal, onLine(line) {
    const progress = progressLine(line);
    if (progress) report(progress);
  } });
  if (!cover || format !== 'mp3') return path.join(cwd, 'media.' + format);
  report({ phase: 'processing' });
  return embedCover(cwd, cover, title, artist, signal);
}

async function embedCover(cwd, cover, title, artist, signal) {
  const artwork = 'cover.' + cover.ext;
  await fs.writeFile(path.join(cwd, artwork), cover.buffer, { flag: 'wx', signal });
  await runTool(ffmpeg, ['-nostdin', '-v', 'error', '-n', '-i', 'media.mp3',
      '-f', cover.ext === 'png' ? 'png_pipe' : 'jpeg_pipe', '-i', artwork,
      '-map', '0:a:0', '-map', '1:v:0', '-c', 'copy', '-id3v2_version', '3',
      '-disposition:v:0', 'attached_pic', '-metadata:s:v:0', 'comment=Cover (front)',
      '-metadata', 'title=' + title, '-metadata', 'artist=' + artist, 'tagged.mp3'], { cwd, signal });
  return path.join(cwd, 'tagged.mp3');
}

module.exports = { runTool, downloadArgs, inspectMedia, extractMedia, progressLine, embedCover };

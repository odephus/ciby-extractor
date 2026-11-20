const path = require('node:path');
const fs = require('node:fs/promises');

const formats = new Set(['mp3', 'mp4', 'flac', 'wav']);
const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'music.youtube.com', 'm.youtube.com', 'youtu.be']);
const soundcloudHosts = new Set(['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com']);

function sourceUrl(value) {
  const invalid = 'Enter a supported HTTPS YouTube, Spotify or SoundCloud media link.';
  if (typeof value !== 'string' || value.length > 4096 || /[\s\\\x00-\x1f\x7f]/.test(value) || !value.startsWith('https://')) {
    throw new Error(invalid);
  }
  const url = URL.parse(value);
  if (!url || url.protocol !== 'https:' || url.port || url.username || url.password) throw new Error(invalid);
  if (youtubeHosts.has(url.hostname)) {
    const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) :
      url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:shorts|embed|live)\/([^/]+)\/?$/.exec(url.pathname)?.[1];
    if (id && /^[\w-]{11}$/.test(id)) return { provider: 'youtube', url: 'https://www.youtube.com/watch?v=' + id };
    const list = url.searchParams.get('list');
    if (url.pathname === '/playlist' && list && /^[\w-]{2,100}$/.test(list)) {
      return { provider: 'youtube', url: 'https://www.youtube.com/playlist?list=' + list };
    }
  }
  if (url.hostname === 'open.spotify.com') {
    const track = /^\/(?:intl-[a-zA-Z-]+\/)?(?:embed\/)?track\/([A-Za-z0-9]{22})\/?$/.exec(url.pathname);
    if (track) return { provider: 'spotify', url: 'https://open.spotify.com/track/' + track[1] };
  }
  if (soundcloudHosts.has(url.hostname) && /^\/[\w-]+\/(?:sets\/)?[\w-]+(?:\/s-[\w-]+)?\/?$/.test(url.pathname)) {
    const result = new URL(url.pathname, 'https://soundcloud.com');
    const secret = url.searchParams.get('secret_token');
    if (secret && /^s-[\w-]+$/.test(secret)) result.searchParams.set('secret_token', secret);
    return { provider: 'soundcloud', url: result.href };
  }
  if (url.hostname === 'on.soundcloud.com' && /^\/[a-zA-Z0-9]+\/?$/.test(url.pathname)) {
    return { provider: 'soundcloud-share', url: url.origin + url.pathname };
  }
  throw new Error(invalid);
}

function thumbnailUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  const url = URL.parse(value);
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  return /^(?:[\w-]+\.)*(?:ytimg\.com|sndcdn\.com|ggpht\.com)$/.test(url.hostname) ? url.href : null;
}

function validateFormat(format) {
  if (!formats.has(format)) throw new Error('Choose MP4, MP3, FLAC or WAV.');
  return format;
}

function validatePath(file, format, platform = process.platform) {
  validateFormat(format);
  const paths = platform === 'win32' ? path.win32 : path.posix;
  if (typeof file !== 'string' || !paths.isAbsolute(file) || /[\x00-\x1f\x7f]/.test(file) ||
      paths.extname(file).toLowerCase() !== '.' + format || file.split(paths.sep).includes('..')) {
    throw new Error('Choose an absolute output path with the selected media extension.');
  }
  if (platform === 'win32') {
    if (!/^[a-z]:[\\/]/i.test(file) || file.slice(3).split(/[\\/]/).some(part =>
      !part || /^[.]{1,2}$|[. ]$|[<>:"|?*]|^(?:con|prn|aux|nul|conin\$|conout\$|(?:lpt|com)[1-9¹²³])(?:\.|$)/i.test(part))) {
      throw new Error('Choose a regular file on a local drive.');
    }
  }
}

async function outputStat(file) {
  try {
    const stat = await fs.lstat(file, { bigint: true });
    if (!stat.isFile()) throw new Error('The destination must be a regular file.');
    return stat;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readCover(file) {
  const limit = 10 * 1024 * 1024;
  const selected = await fs.lstat(file, { bigint: true });
  if (!selected.isFile()) throw new Error('Select a regular artwork file.');
  const { O_RDONLY, O_NOFOLLOW, O_NONBLOCK } = require('node:fs').constants;
  const handle = await fs.open(file, O_RDONLY | (O_NOFOLLOW || 0) | (O_NONBLOCK || 0));
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile() || stat.dev !== selected.dev || stat.ino !== selected.ino) throw new Error('The selected artwork changed.');
    if (stat.size < 8n || stat.size > limit) throw new Error('Choose artwork up to 10 MiB.');
    const buffer = Buffer.alloc(Number(stat.size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead === buffer.length) {
      if (buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return { ext: 'png', buffer };
      if (buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return { ext: 'jpg', buffer };
    }
    throw new Error('Choose a PNG or JPEG artwork file.');
  } finally {
    await handle.close();
  }
}

module.exports = { sourceUrl, thumbnailUrl, validateFormat, validatePath, outputStat, readCover };

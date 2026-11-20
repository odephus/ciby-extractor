const spotifyUrlInfo = require('spotify-url-info');
const { sourceUrl, thumbnailUrl } = require('./validation');
const { inspectMedia } = require('./media-process');

async function spotifyPreview(trackUrl, signal) {
  // spotify-url-info constructs a legacy embed URL. Use the current embed
  // endpoint directly and keep the request on the validated Spotify origin.
  const endpoint = trackUrl.replace('/track/', '/embed/track/');
  const client = spotifyUrlInfo(async () => {
    const response = await fetch(endpoint, { signal, redirect: 'error' });
    if (!response.ok) throw new Error('Spotify returned HTTP ' + response.status + '.');
    return response;
  });
  return client.getPreview(trackUrl);
}

async function analyze(value, signal, inspect = inspectMedia, preview = spotifyPreview) {
  let source = sourceUrl(value);
  if (source.provider === 'soundcloud-share') {
    const response = await fetch(source.url, { method: 'HEAD', redirect: 'manual', signal });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) throw new Error('Could not resolve the SoundCloud share link.');
    source = sourceUrl(new URL(location, source.url).href);
    if (source.provider !== 'soundcloud') throw new Error('Share link did not resolve to a SoundCloud track.');
  }
  const isSpotify = source.provider === 'spotify';
  let title, artist, lookup = source.url;
  if (isSpotify) {
    const data = await preview(source.url, signal);
    if (![data?.title, data?.artist].every(v => typeof v === 'string' && v.trim() && v.length <= 512 && !/[\x00-\x1f\x7f]/.test(v))) {
      throw new Error('Spotify returned incomplete track information.');
    }
    artist = data.artist;
    title = artist + ' - ' + data.title;
    lookup = 'ytsearch1:' + title;
  }
  const info = await inspect(lookup, signal);
  let target = source.url;
  if (isSpotify || source.url.startsWith('https://www.youtube.com/playlist?') || source.url.includes('/sets/')) {
    const track = sourceUrl(info.webpage_url);
    if (track.provider !== (isSpotify ? 'youtube' : source.provider)) throw new Error('Unexpected media provider in search results.');
    target = track.url;
  }
  return { target, artist: artist || 'Unknown', title: title || info.title.slice(0, 1024),
    thumbnail: thumbnailUrl(info.thumbnail), duration: info.duration_string || info.duration, isSpotify };
}

module.exports = { analyze };

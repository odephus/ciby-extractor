const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceUrl, thumbnailUrl, validatePath, validateFormat } = require('../validation');
const { analyze } = require('../media-info');
const { downloadArgs, progressLine } = require('../media-process');

const videoId = 'abcdefghijk';
const watch = 'https://www.youtube.com/watch?v=' + videoId;
const track = 'https://open.spotify.com/track/0123456789012345678901';

test('normalizes provider links and discards unrelated URL parameters', () => {
  for (const url of [watch + '&t=4', 'https://youtu.be/' + videoId, 'https://m.youtube.com/shorts/' + videoId,
    'https://music.youtube.com/watch?v=' + videoId]) assert.equal(sourceUrl(url).url, watch);
  assert.equal(sourceUrl(track.replace('/track', '/intl-tr/track') + '?si=x').url, track);
  assert.equal(sourceUrl('https://m.soundcloud.com/user/track?si=abc').url, 'https://soundcloud.com/user/track');
  assert.equal(sourceUrl('https://soundcloud.com/user/track/s-123').provider, 'soundcloud');
  assert.equal(sourceUrl('https://on.soundcloud.com/abc').provider, 'soundcloud-share');
});

test('rejects malformed links, arbitrary hosts, special protocols and unsupported endpoints', () => {
  for (const value of [null, {}, '--version', 'ytsearch1:test', 'file:///music.mp3', watch.replace('https:', 'http:'),
    watch.replace('youtube.com', 'youtube.com.example'), watch.replace('www.', 'user@www.'), watch.replace('.com', '.com:8443'),
    watch + '\n', 'https://soundcloud.com/', 'https://www.youtube.com/redirect?q=x', 'https://spotify.com.example/track',
    'https://127.0.0.1/song', 'https://open.spotify.com/track/bad']) assert.throws(() => sourceUrl(value));
  for (const image of ['file:///art.png', 'https://untrusted.example/art', 'https://i.ytimg.com:81/x', null]) {
    assert.equal(thumbnailUrl(image), null);
  }
  assert.equal(thumbnailUrl('https://i.ytimg.com/vi/x/0.jpg'), 'https://i.ytimg.com/vi/x/0.jpg');
});

test('validates format and Windows save paths including devices and named streams', () => {
  for (const value of [undefined, {}, 'exe', ['mp3'], 'MP3']) assert.throws(() => validateFormat(value));
  for (const file of ['out.mp3', 'C:/x.txt', 'C:/out/file:stream.mp3', '//host/share/song.mp3',
    '//?/C:/x.mp3', 'C:/x/../x.mp3', 'C:/aux.mp3', 'C:/foo./x.mp3', 'C:/com1/x.mp3']) {
    assert.throws(() => validatePath(file, 'mp3', 'win32'));
  }
  validatePath('C:/Music/100% (live) + mix.MP3', 'mp3', 'win32');
});

test('Spotify resolves once and pins the previewed YouTube result', async () => {
  const signal = new AbortController().signal;
  const result = await analyze(track, signal, async (query, lookupSignal) => {
    assert.equal(query, 'ytsearch1:An Artist - A Title');
    assert.equal(lookupSignal, signal);
    return { title: 'Video', webpage_url: watch, thumbnail: 'file:///cover' };
  }, async url => { assert.equal(url, track); return { artist: 'An Artist', title: 'A Title' }; });
  assert.equal(result.target, watch);
  assert.equal(result.title, 'An Artist - A Title');
  assert.equal(result.isSpotify, true);
  assert.equal(result.thumbnail, null);
  await assert.rejects(analyze(track, signal, () => assert.fail(), () => ({})), /incomplete/);
  await assert.rejects(analyze(track, signal, () => ({ webpage_url: 'https://soundcloud.com/user/song' }),
    () => ({ artist: 'Artist', title: 'Title' })), /Unexpected media provider/);
});

test('every format has a fixed relative output template and a single operand after --', () => {
  for (const format of ['mp3', 'mp4', 'flac', 'wav']) {
    const args = downloadArgs(watch, format, false);
    assert.deepEqual(args.slice(-2), ['--', watch]);
    assert.equal(args[args.indexOf('-o') + 1], 'media.%(ext)s');
    assert.ok(args.includes('--ignore-config') && args.includes('--no-plugin-dirs'));
    assert.ok(!args.some(arg => arg.includes('no-check-cert')));
    assert.equal(args.includes('--embed-thumbnail'), ['mp3', 'flac'].includes(format));
  }
  assert.throws(() => downloadArgs(watch, '--help', false));
  assert.ok(!downloadArgs(watch, 'mp3', true).includes('--embed-thumbnail'));
});

test('progress handles estimated, unknown, completed and processing stages', () => {
  assert.deepEqual(progressLine('CIBY_BYTES 17 68'), { phase: 'download', percent: 25 });
  assert.equal(progressLine('CIBY_BYTES 100 95').percent, 100);
  for (const line of ['CIBY_BYTES 1 NA', 'CIBY_BYTES NA NA', 'CIBY_BYTES 0 0']) assert.equal(progressLine(line).percent, null);
  assert.deepEqual(progressLine('CIBY_PROCESS'), { phase: 'processing' });
  assert.equal(progressLine('unrelated line'), null);
});

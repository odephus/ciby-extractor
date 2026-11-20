const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');
const { downloadArgs, runTool, embedCover, progressLine } = require('../media-process');

test('bundled tools extract four formats and embed MP3 artwork from a local media fixture', async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'ciby-tools-'));
  t.after(() => fs.rm(cwd, { force: true, recursive: true }));
  const ffmpeg = require('ffmpeg-static');
  const ytDlp = path.join(path.dirname(require.resolve('yt-dlp-exec/package.json')), 'bin',
    process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  await runTool(ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=size=32x32:rate=5',
    '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '0.5', '-c:v', 'mpeg4', '-c:a', 'aac', 'input.mp4'], { cwd });
  const sample = await fs.readFile(path.join(cwd, 'input.mp4'));
  await runTool(ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=size=16x16',
    '-frames:v', '1', 'fixture.png'], { cwd });
  const artwork = await fs.readFile(path.join(cwd, 'fixture.png'));
  const server = http.createServer((req, res) => {
    const image = req.url === '/fixture.png';
    const body = image ? artwork : sample;
    res.writeHead(200, { 'Content-Type': image ? 'image/png' : 'video/mp4', 'Content-Length': body.length });
    res.end(body);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  // An offline extractor result exercises the real downloader and postprocessors
  // without allowing the Generic extractor or loopback sources through IPC.
  await fs.writeFile(path.join(cwd, 'fixture.json'), JSON.stringify({
    id: 'fixture', title: 'Fixture', extractor: 'fixture', extractor_key: 'Fixture',
    webpage_url: 'https://www.youtube.com/watch?v=abcdefghijk',
    thumbnail: 'http://127.0.0.1:' + server.address().port + '/fixture.png',
    url: 'http://127.0.0.1:' + server.address().port + '/input.mp4', ext: 'mp4',
    vcodec: 'mpeg4', acodec: 'aac'
  }));
  for (const variant of ['mp4', 'wav', 'flac', 'mp3', 'mp3-custom']) {
    await t.test(variant, async () => {
      const custom = variant === 'mp3-custom';
      const format = custom ? 'mp3' : variant;
      const dir = path.join(cwd, variant);
      await fs.mkdir(dir);
      const args = downloadArgs('fixture', format, custom).slice(0, -2);
      const events = [];
      await runTool(ytDlp, [...args, '--load-info-json', path.join(cwd, 'fixture.json')], {
        cwd: dir, onLine: line => { const event = progressLine(line); if (event) events.push(event); }
      });
      assert.ok(events.some(event => event.phase === 'download' && event.percent === 100), JSON.stringify(events));
      let output = path.join(dir, 'media.' + format);
      if (custom) output = await embedCover(dir, { ext: 'png', buffer: artwork }, 'Fixture', 'Test Artist');
      if (format === 'mp3' || format === 'flac') {
        await runTool(ffmpeg, ['-v', 'error', '-i', output, '-map', '0:v:0', '-frames:v', '1', '-f', 'null', '-']);
      }
      await runTool(ffmpeg, ['-v', 'error', '-i', output, '-map', '0:a:0', '-f', 'null', '-']);
    });
  }
});

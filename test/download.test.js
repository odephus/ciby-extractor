const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { MediaJobs, saveMedia } = require('../download');
const { readCover } = require('../validation');
const { runTool } = require('../media-process');

async function fixture(t) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'ciby-test-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const file = path.join(parent, '100% %(title)s.mp3');
  await fs.writeFile(file, 'original');
  return { parent, file, jobs: new MediaJobs() };
}

test('failed postprocessing cleans partial files, preserves old output and permits retry', async t => {
  const { parent, file, jobs } = await fixture(t);
  const run = extract => jobs.run('download', job => saveMedia(job, file, 'mp3', extract));
  const failed = await run(async dir => {
    await fs.writeFile(path.join(dir, 'media.part'), 'partial');
    throw new Error('FFmpeg could not convert this stream.');
  });
  assert.match(failed.error, /FFmpeg/);
  assert.equal(await fs.readFile(file, 'utf8'), 'original');
  assert.deepEqual(await fs.readdir(parent), [path.basename(file)]);
  const retry = await run(async dir => {
    const out = path.join(dir, 'media.mp3');
    await fs.writeFile(out, 'complete');
    return out;
  });
  assert.deepEqual(retry, { success: true, filePath: file });
  assert.equal(await fs.readFile(file, 'utf8'), 'complete');
});

test('overlapping IPC jobs are rejected and cancellation waits for the child and cleanup', { timeout: 15000 }, async t => {
  const { parent, file, jobs } = await fixture(t);
  const ready = Promise.withResolvers();
  const job = jobs.run('download', job => saveMedia(job, file, 'mp3', async (cwd, signal) => {
    await fs.writeFile(path.join(cwd, 'media.part'), 'incomplete');
    await runTool(process.execPath, ['-e', "console.log('ready'); setInterval(() => {}, 1000)"],
      { cwd, signal, onLine: () => ready.resolve() });
  }));
  assert.match((await jobs.run('download', () => assert.fail())).error, /in progress/);
  assert.match((await jobs.run('analysis', () => assert.fail())).error, /in progress/);
  await Promise.race([ready.promise, job.then(result => assert.fail(JSON.stringify(result)))]);
  assert.equal(jobs.cancel('cover'), false);
  assert.equal(jobs.cancel('download'), true);
  assert.deepEqual(await job, { canceled: true });
  assert.deepEqual(await fs.readdir(parent), [path.basename(file)]);
  assert.equal(await fs.readFile(file, 'utf8'), 'original');
  assert.equal(jobs.current, null);
});

test('missing, empty and concurrently replaced output do not report success', async t => {
  const { parent, file, jobs } = await fixture(t);
  for (const mode of ['missing', 'empty', 'changed']) {
    const result = await jobs.run('download', job => saveMedia(job, file, 'mp3', async dir => {
      const out = path.join(dir, 'media.mp3');
      if (mode !== 'missing') await fs.writeFile(out, mode === 'empty' ? '' : 'full');
      if (mode === 'changed') await fs.writeFile(file, 'another file');
      return out;
    }));
    assert.match(result.error, mode === 'changed' ? /changed/ : /no usable/);
  }
  assert.equal(await fs.readFile(file, 'utf8'), 'another file');
  assert.deepEqual(await fs.readdir(parent), [path.basename(file)]);
});

test('artwork reader rejects oversized or mislabeled files and snapshots selected bytes', async t => {
  const { parent } = await fixture(t);
  const file = path.join(parent, 'cover.jpg');
  await fs.writeFile(file, 'bad image');
  await assert.rejects(readCover(file), /PNG or JPEG/);
  await fs.truncate(file, 10 * 1024 * 1024 + 1);
  await assert.rejects(readCover(file), /10 MiB/);
  const header = Buffer.from('89504e470d0a1a0a', 'hex');
  await fs.writeFile(file, header);
  const cover = await readCover(file);
  await fs.unlink(file);
  assert.equal(cover.ext, 'png');
  assert.deepEqual(cover.buffer, header);
});

test('tool runner reports launch and subprocess failures and reassembles split lines', async t => {
  const { parent } = await fixture(t);
  await assert.rejects(runTool(path.join(parent, 'missing-tool'), []), /missing/);
  await assert.rejects(runTool(process.execPath, ['-e', "console.error('ERROR: specific detail'); process.exit(3)"]),
    /failed \(3\).*\nERROR: specific detail/);
  const lines = [];
  await runTool(process.execPath, ['-e', "process.stdout.write('one'); setTimeout(() => process.stdout.write(' two\\nthree\\nfour'), 20)"],
    { onLine: line => lines.push(line) });
  assert.deepEqual(lines, ['one two', 'three', 'four']);
});

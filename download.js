const fs = require('node:fs/promises');
const path = require('node:path');
const { validatePath, outputStat } = require('./validation');

class MediaJobs {
  current = null;

  async run(kind, work) {
    if (this.current) return { error: 'Another media operation is in progress.' };
    const controller = new AbortController();
    const job = { kind, controller, committing: false };
    this.current = job;
    job.done = Promise.resolve().then(() => work(job)).catch(error => {
      if (controller.signal.aborted && error === controller.signal.reason) return { canceled: true };
      return { error: error.message };
    }).finally(() => { this.current = null; });
    return job.done;
  }

  cancel(kind) {
    const job = this.current;
    if (!job || (kind && job.kind !== kind) || job.committing) return false;
    job.controller.abort();
    return true;
  }
}

async function saveMedia(job, file, format, extract) {
  const { signal } = job.controller;
  signal.throwIfAborted();
  validatePath(file, format);
  // Resolve the selected parent once. All media tools operate in a private
  // sibling directory, even when the final name contains yt-dlp template text.
  const parent = await fs.realpath(path.dirname(file));
  const destination = path.join(parent, path.basename(file));
  const before = await outputStat(destination);
  const dir = await fs.mkdtemp(path.join(parent, '.ciby-'));
  try {
    signal.throwIfAborted();
    const staged = await extract(dir, signal);
    const generated = await outputStat(staged);
    if (!generated || generated.size === 0n) throw new Error('The media tool produced no usable ' + format.toUpperCase() + ' file.');
    const now = await outputStat(destination);
    if (now?.dev !== before?.dev || now?.ino !== before?.ino || now?.ctimeNs !== before?.ctimeNs) {
      throw new Error('The destination changed during extraction. Choose the file again.');
    }
    signal.throwIfAborted();
    job.committing = true;
    await fs.rename(staged, destination);
    return { success: true, filePath: file };
  } finally {
    try { await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }); }
    catch (error) { throw new Error('Could not remove temporary files at ' + dir + ': ' + error.message); }
  }
}

module.exports = { MediaJobs, saveMedia };

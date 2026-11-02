import fs from 'node:fs';
import path from 'node:path';

// One worker per durable local volume. Never use a shared/network filesystem.
export class Store {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.directory = directory;
    this.lock = path.join(directory, 'worker.lock');
    this.fd = fs.openSync(this.lock, 'wx', 0o600);
    fs.writeSync(this.fd, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
    this.file = path.join(directory, 'state.json');
    try {
      this.state = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { version: 1, seen: {}, jobs: [], proposals: {}, audit: [], usage: {} };
      if (this.state.version !== 1) throw Error('Unsupported state version');
      for (const j of this.state.jobs) if (j.status === 'running') j.status = 'uncertain';
      this.save();
    } catch (error) { this.close(); throw error; }
  }
  save() {
    const temp = this.file + '.tmp';
    const fd = fs.openSync(temp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(this.state)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, this.file);
    const dir = fs.openSync(this.directory, 'r');
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  }
  audit(type, data) { this.state.audit.push({ at: new Date().toISOString(), type, ...data }); this.save(); }
  close() { if (this.fd !== undefined) { fs.closeSync(this.fd); this.fd = undefined; fs.unlinkSync(this.lock); } }
}

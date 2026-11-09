import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getAgentDir } from '../../config.js';

export function nativeRoot() { return path.join(getAgentDir(), 'native'); }
export function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; } }
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, file);
}
export function readPolicy() { return { rules: [], sounds: false, volume: 0.5, hooks: [], ...readJson(path.join(nativeRoot(), 'policy.json'), {}) }; }
export function updatePolicy(patch) { const next = { ...readPolicy(), ...patch }; writeJson(path.join(nativeRoot(), 'policy.json'), next); return next; }
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const fingerprint = file => fs.existsSync(file) ? digest(fs.readFileSync(file)) : null;

export class Checkpoints {
  constructor(session, cwd) { this.cwd = cwd; this.directory = path.join(nativeRoot(), 'checkpoints', session); this.index = path.join(this.directory, 'index.json'); }
  list() { return readJson(this.index, []); }
  before(tool, input, toolCallId) {
    const supplied = input.path ?? input.file_path;
    if (!supplied) throw new Error('Не указан путь для резервной копии.');
    let file = path.resolve(this.cwd, supplied.startsWith('~/') ? path.join(process.env.HOME || '', supplied.slice(2)) : supplied);
    const existed = fs.existsSync(file);
    if (existed) file = fs.realpathSync(file);
    const mode = existed ? fs.statSync(file).mode : null;
    if (existed && !fs.statSync(file).isFile()) throw new Error('Откат поддерживает только обычные файлы.');
    const id = crypto.randomUUID(); fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    if (existed) { fs.copyFileSync(file, path.join(this.directory, id)); fs.chmodSync(path.join(this.directory, id), 0o600); }
    const record = { id, tool, toolCallId, file, existed, mode, before: fingerprint(file), at: new Date().toISOString(), pending: true };
    writeJson(this.index, [...this.list(), record]); return record;
  }
  after(toolCallId, failed) {
    const records = this.list(); const affected = records.filter(item => item.toolCallId === toolCallId && item.pending);
    if (!affected.length) return;
    for (const item of affected) {
      item.after = fingerprint(item.file); item.pending = false; item.failed = Boolean(failed);
      item.changed = item.before !== item.after;
      if (item.after !== null) { fs.copyFileSync(item.file, path.join(this.directory, `${item.id}.after`)); fs.chmodSync(path.join(this.directory, `${item.id}.after`), 0o600); }
    }
    writeJson(this.index, records);
  }
  undo() {
    const records = this.list(); const item = records.findLast(item => !item.undone && item.changed && !item.pending);
    if (!item) return 'Нет правок для отката.';
    const group = records.filter(record => record.toolCallId === item.toolCallId && !record.undone && record.changed);
    // Validate every target before restoring any member of a multi-file patch.
    for (const record of group) {
      if (fs.existsSync(record.file) && fs.lstatSync(record.file).isSymbolicLink() || fingerprint(record.file) !== record.after) throw new Error('Файл изменён после сохранённой правки. Откат остановлен, чтобы не затереть новые изменения.');
    }
    for (const record of group.reverse()) {
      if (record.existed) { fs.mkdirSync(path.dirname(record.file), { recursive: true }); fs.copyFileSync(path.join(this.directory, record.id), record.file); fs.chmodSync(record.file, record.mode); }
      else fs.unlinkSync(record.file);
      record.undone = true;
    }
    writeJson(this.index, records); return `Восстановлены: ${group.map(record => record.file).join(', ')}`;
  }
}

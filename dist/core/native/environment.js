import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Type } from 'typebox';

const exec = promisify(execFile);
const gib = bytes => Math.round(bytes / 1024 ** 3 * 10) / 10;
// Stable information only: free memory belongs in the live tool, not a cached prompt.
const hardware = { os: os.platform(), release: os.release(), architecture: os.arch(), cpu: os.cpus()[0]?.model || 'unknown', logicalCPUs: os.cpus().length, availableCPUs: os.availableParallelism(), totalMemoryGiB: gib(os.totalmem()) };
export function environmentSummary() {
  return `${hardware.os} ${hardware.release}, ${hardware.architecture}; CPU: ${hardware.cpu}; логических CPU: ${hardware.logicalCPUs} (доступно процессу: ${hardware.availableCPUs}); RAM: ${hardware.totalMemoryGiB} GiB. GPU и свободные ресурсы проверяй по необходимости через system_info.`;
}
export function createSystemInfoTool() {
  return {
    name: 'system_info', label: 'Устройство', executionMode: 'parallel',
    description: 'Фактическая ОС, CPU, RAM и доступная процессу среда. gpu=true дополнительно запрашивает NVIDIA GPU через nvidia-smi. Не читает ключи, документы или историю пользователя.',
    parameters: Type.Object({ gpu: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
    async execute(_id, { gpu = false }, signal, _update, ctx) {
      if (signal?.aborted) throw new Error('Запрос отменён.');
      const result = { ...hardware, freeMemoryGiB: gib(os.freemem()), node: process.version, cwd: ctx?.cwd || process.cwd(), displayAvailable: Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY), sessionType: process.env.XDG_SESSION_TYPE || 'unknown' };
      if (gpu) {
        try { result.nvidia = (await exec('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader'], { timeout: 2000, maxBuffer: 16384, signal, windowsHide: true })).stdout.trim(); }
        catch (error) { if (signal?.aborted) throw error; result.nvidia = 'Данные NVIDIA недоступны; это не доказывает отсутствие других GPU.'; }
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], details: result };
    },
  };
}

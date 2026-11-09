import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findExecutable } from './platform.mjs';
export function playSound(kind, policy) {
  if (!policy.sounds || policy.volume <= 0) return;
  const file = fileURLToPath(new URL(`../../assets/sounds/${kind === 'attention' ? 'attention' : 'complete'}.wav`, import.meta.url));
  const volume = Math.max(0, Math.min(1, policy.volume ?? 0.5));
  let command, args;
  if (findExecutable('paplay')) { command = 'paplay'; args = ['--volume', String(Math.round(volume * 65536)), file]; }
  else if (findExecutable('afplay')) { command = 'afplay'; args = ['-v', String(volume), file]; }
  else if (findExecutable('ffplay')) { command = 'ffplay'; args = ['-nodisp','-autoexit','-loglevel','quiet','-volume',String(Math.round(volume * 100)),file]; }
  else { if (process.stdout.isTTY) process.stdout.write('\x07'); return; }
  const child = spawn(command, args, { stdio: 'ignore', windowsHide: true }); child.on('error', () => {}); child.unref();
}

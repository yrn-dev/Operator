import fs from 'node:fs';
import path from 'node:path';
import { getAgentDir, VERSION } from '../../config.js';
import { inspectEnvironment } from './computer.mjs';
import { browserExecutable } from './browser.js';
import { findExecutable } from './platform.mjs';
export function doctor() {
  const input = inspectEnvironment();
  let keys = []; try { keys = Object.keys(JSON.parse(fs.readFileSync(path.join(getAgentDir(), 'auth.json'), 'utf8'))); } catch {}
  return [
    `Operator ${VERSION} · Node ${process.version}`,
    `Ключи: ${keys.join(', ') || (process.env.ALEM_AI_API_KEY ? 'ALEM_AI_API_KEY' : 'не настроены; в CLI: /keys')}`,
    `Браузер: ${browserExecutable() || 'нужен Chrome/Chromium или OPERATOR_BROWSER_EXECUTABLE'}`,
    `Снимки: ${input.screenshot.join(', ') || 'нужен backend захвата экрана'}`,
    `Мышь/клавиатура: ${input.input || 'не настроены'}`,
    `GitHub: ${findExecutable('gh') || 'gh не установлен'}; авторизацию проверяет gh auth status`,
    `Автопилот включается явно: /autopilot on или --autopilot`,
    `Команды: /features · /jobs · /agents · /chat · /undo · /changes · /permissions · /keys · /sound`,
  ].join('\n');
}

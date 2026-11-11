import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { parsePatch, createTwoFilesPatch } from 'diff';
import { Text, matchesKey, Key } from '@earendil-works/pi-tui';
import { Checkpoints, nativeRoot, readPolicy, updatePolicy } from './state.js';
import { COMMAND_TOOLS, isDangerousCommand, matchRule, subjectOf, rememberedRule } from './command-policy.mjs';
import { createBackgroundTools, createGithubTool } from './tasks.mjs';
import { createSubagentTool } from './subagent.mjs';
import { createComputerTool, inspectEnvironment } from './computer.mjs';
import { AgentBrowser, browserExecutable, createBrowserTool } from './browser.js';
import { findExecutable } from './platform.mjs';
import { ChatHub } from './chats.js';
import { playSound } from './sounds.js';
import { describeUserError } from './user-error.js';
import { createSystemInfoTool } from './environment.js';

const textResult = text => ({ content: [{ type: 'text', text }], details: {} });
const clean = text => String(text).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');

export async function secretInput(ctx, title) {
  if (ctx.mode !== 'tui') throw new Error('Ключи вводятся в интерактивном терминале.');
  return ctx.ui.custom((tui, _theme, _keys, done) => {
    let value = '';
    return { invalidate() {}, render(width) { return new Text(`${title}\n${'•'.repeat(Math.min(value.length, 60))}\nEnter — сохранить · Esc — отмена`, 0, 0).render(width); },
      handleInput(data) {
        if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl('c'))) { done(undefined); return; }
        if (matchesKey(data, Key.enter)) { done(value.trim() || undefined); return; }
        if (matchesKey(data, Key.backspace)) value = [...value].slice(0, -1).join('');
        else value += data.replace(/\x1b\[20[01]~/g, '').replace(/[\x00-\x20\x7f]/g, '');
        tui.requestRender();
      },
    };
  });
}

export default function nativeFeatures(operator) {
  let current, checkpoints, autopilot = false;
  const agents = new Map(); const jobs = new Map();
  const browser = new AgentBrowser(() => autopilot);
  const report = (text, type = 'info') => current?.ui.notify(clean(text), type);
  const hub = new ChatHub(() => current, text => { report(text); playSound('attention', readPolicy()); });
  const refresh = () => {
    if (!current) return;
    const active = [...agents.values()].filter(a => a.running);
    const statuses = [autopilot ? 'автопилот' : '', [...jobs.values()].filter(Boolean).length ? `${[...jobs.values()].filter(Boolean).length} в фоне` : '', active.length ? `${active.length} субагентов` : '', hub.chats.size ? `${hub.chats.size} диалогов` : ''].filter(Boolean);
    current.ui.setStatus('native', statuses.length ? statuses.join(' · ') : undefined);
    current.ui.setWidget('subagents', active.length ? active.map(a => clean(`↳ ${a.label} · ${a.step || 'работает'}`)) : undefined);
  };
  const bind = ctx => { current = ctx; checkpoints = new Checkpoints(ctx.sessionManager.getSessionId(), ctx.cwd); refresh(); };
  operator.registerFlag('autopilot', { type: 'boolean', description: 'Разрешить browser/computer для текущего запуска', default: false });
  operator.on('session_start', (_event, ctx) => { bind(ctx); autopilot = operator.getFlag('autopilot') === true; refresh(); });
  operator.on('session_switch', async (_event, ctx) => { await browser.close(); autopilot = false; bind(ctx); });
  operator.on('session_shutdown', async () => { await browser.close(); await hub.close(); });

  const background = createBackgroundTools(path.join(nativeRoot(), 'jobs'), event => { jobs.set(event.id, event.action === 'start'); refresh(); });
  for (const tool of background) operator.registerTool(tool);
  operator.registerTool(createGithubTool());
  operator.registerTool(createSystemInfoTool());
  operator.registerTool(createBrowserTool(browser));
  operator.registerTool(createComputerTool(() => autopilot));
  const subagent = createSubagentTool();
  operator.registerTool({ ...subagent,
    async execute(id, params, signal, onUpdate, ctx) {
      const record = { label: params.label || params.task.slice(0, 50), running: true, steps: [], answer: '' }; agents.set(id, record); refresh();
      try {
        const result = await subagent.execute(id, params, signal, update => { record.steps = update.details?.steps || []; record.step = record.steps.at(-1)?.subject; refresh(); onUpdate?.(update); }, ctx);
        record.answer = result.content.filter(b => b.type === 'text').map(b => b.text).join('\n'); return result;
      } finally { record.running = false; refresh(); }
    },
  });

  operator.on('tool_call', async (event, ctx) => {
    bind(ctx);
    let policy;
    try { policy = readPolicy(); } catch { return { block: true, reason: 'Не удалось прочитать policy.json. Исправь файл перед запуском инструментов.' }; }
    const tool = event.toolName, subject = subjectOf(tool, event.input);
    const rule = matchRule(policy.rules, tool, subject);
    const dangerous = COMMAND_TOOLS.has(tool) && isDangerousCommand(subject);
    if (rule?.action === 'deny') return { block: true, reason: 'Вызов запрещён правилом пользователя.' };
    const exact = rule?.action === 'allow' && rule.tool === tool && rule.subject === subject;
    if (rule?.action === 'ask' || dangerous && !exact) {
      if (!ctx.hasUI) return { block: true, reason: 'Нужно подтверждение опасной команды. Запусти интерактивный CLI или заранее разреши точную команду через /permissions.' };
      playSound('attention', policy);
      const choice = await ctx.ui.select(`Подтверждение ${tool}: ${subject}`, ['Разрешить один раз','Разрешить всегда','Отклонить'], { timeout: 300000 });
      if (choice === 'Разрешить всегда') updatePolicy({ rules: [rememberedRule(tool, subject), ...readPolicy().rules] });
      if (!['Разрешить один раз','Разрешить всегда'].includes(choice)) return { block: true, reason: 'Пользователь отклонил действие.' };
    }
    if (['write','edit','patch'].includes(tool)) {
      try {
        const inputs = tool === 'patch' ? parsePatch(event.input.patch).map(entry => ({ path: (entry.newFileName === '/dev/null' ? entry.oldFileName : entry.newFileName).replace(/^[ab]\//, '') })) : [event.input];
        for (const input of inputs) checkpoints.before(tool, input, event.toolCallId);
      } catch (error) { return { block: true, reason: `Не удалось сохранить копию перед правкой: ${error.message}` }; }
    }
  });
  function runHooks(event, payload, ctx) {
    for (const hook of readPolicy().hooks) {
      if (hook.event !== event || hook.tool && hook.tool !== payload.tool || typeof hook.command !== 'string') continue;
      const child = spawn(hook.command, { shell: true, cwd: hook.cwd || ctx.cwd, stdio: 'ignore', windowsHide: true,
        env: { ...process.env, OPERATOR_HOOK_EVENT: event, OPERATOR_HOOK_TOOL: payload.tool || '', OPERATOR_HOOK_FILE: payload.file || '' } });
      child.on('error', error => report(`Ошибка хука: ${error.message}`, 'warning')); child.unref();
    }
  }
  operator.on('tool_result', (event, ctx) => {
    if (['write', 'edit', 'patch'].includes(event.toolName)) { bind(ctx); checkpoints.after(event.toolCallId, event.isError); }
    runHooks('tool_result', { tool: event.toolName, file: event.input?.path }, ctx);
  });
  operator.on('agent_end', (event, ctx) => {
    const last = [...(event.messages || [])].reverse().find(m => m.role === 'assistant');
    if (last?.stopReason === 'stop' && !ctx.hasPendingMessages()) { playSound('complete', readPolicy()); runHooks('agent_end', {}, ctx); }
    if (last?.stopReason === 'error') { const failure = describeUserError(last.errorMessage); report(`[${failure.kind}] ${failure.message}`, 'error'); }
  });

  operator.on('input', (event, ctx) => {
    bind(ctx); ctx.modelRegistry.authStorage.reload();
    if (operator.getSessionName() || !event.text?.trim() || process.env.OPERATOR_NATIVE_CHILD) return;
    // Local naming adds no provider request, process or background thinking.
    const title = clean(event.text.replace(/\s+/g, ' ').trim()).slice(0, 65);
    operator.setSessionName(title);
  });
  operator.on('before_agent_start', event => ({ systemPrompt: event.systemPrompt + `\n\n[ИНСТРУМЕНТЫ OPERATOR CLI]\nСхемы ниже определяют доступные действия. subagent: независимая объёмная подзадача или широкая разведка, по умолчанию только чтение. background_run/check/stop: долгие процессы (серверы, сборки, лог) без блокировки диалога. system_info: фактическое железо. Пользователь включает browser/computer через /autopilot on; не включай их сам. Браузер имеет отдельный профиль; координаты экрана — 0–1000. После действия проверяй результат. write/edit/patch сохраняют копии для /undo (/changes показывает diff), команды и API не входят в этот откат. Опасные команды требуют подтверждения пользователя, отказ не обходи. Внешние интеграции (Slack, Notion и др.), которых нет среди встроенных инструментов, подключаются через MCP-серверы или расширения. Thinking включён у моделей с поддержкой рассуждений; отвечай пользователю всегда на его языке.` }));

  const command = (name, description, handler) => operator.registerCommand(name, { description, handler: async (args, ctx) => {
    bind(ctx); try { const result = await handler(args.trim(), ctx); if (result) operator.sendMessage({ customType: 'operator-command', content: String(result), display: true }); }
    catch (error) { ctx.ui.notify(error.message, 'error'); }
  } });
  command('autopilot', 'on/off — управление браузером и экраном', async args => {
    if (!['on','off',''].includes(args)) throw new Error('/autopilot on|off');
    if (args) autopilot = args === 'on'; if (!autopilot) await browser.close(); refresh(); return `Автопилот ${autopilot ? 'включён' : 'выключен'}.`;
  });
  command('undo', 'Откатить последнюю правку файлов', async (_args, ctx) => { if (!ctx.isIdle()) throw new Error('Останови текущую работу перед откатом.'); return checkpoints.undo(); });
  command('changes', 'История правок; /changes N — diff до/после', args => {
    const records = checkpoints.list().filter(c => c.changed);
    if (!args) return records.map((c,i) => `${i + 1}. ${c.undone ? '↶' : '•'} ${c.at} ${c.file}`).join('\n') || 'Правок нет.';
    const record = records[Number(args) - 1]; if (!record) throw new Error('Укажи номер из /changes.');
    const read = (suffix, exists) => { if (!exists) return ''; const file = path.join(checkpoints.directory, record.id + suffix); if (fs.statSync(file).size > 160 * 1024) throw new Error(`Файл больше 160 КиБ. Сохранённая копия: ${file}`); const bytes = fs.readFileSync(file); if (bytes.includes(0)) throw new Error(`Двоичный файл. Сохранённая копия: ${file}`); return bytes.toString('utf8'); };
    return createTwoFilesPatch(record.file, record.file, read('', record.existed), read('.after', record.after !== null));
  });
  command('jobs', 'Список фоновых процессов; /jobs stop ID', async (args, ctx) => {
    const [action, id] = args.split(/\s+/); const tool = action === 'stop' ? background[2] : background[1];
    const result = await tool.execute(crypto.randomUUID(), action === 'stop' ? { id } : { id: action || undefined }, undefined, undefined, ctx);
    return result.content.map(b => b.text || '').join('\n');
  });
  command('agents', 'Задачи, действия и результаты субагентов', () => [...agents.values()].map(a => `${a.label} · ${a.running ? 'работает' : 'завершён'}\n${a.steps.map(s => `${s.done ? '✓' : '…'} ${s.name} ${s.subject}`).join('\n')}\n${a.answer}`).join('\n\n') || 'Субагентов пока нет.');
  if (!process.env.OPERATOR_CHILD_CHAT) command('chat', 'Несколько диалогов: new/list/show/send/answer/stop/open/close', (args, ctx) => hub.command(args, ctx));
  command('permissions', 'Правила подтверждений: list/allow/deny/remove', (args) => {
    const match = args.match(/^(allow|deny)\s+(\S+)\s+([\s\S]+)$/);
    if (match) { const [, action, tool, subject] = match; updatePolicy({ rules: [{ tool, subject, action }, ...readPolicy().rules] }); return 'Сохранено точное правило для инструмента и аргументов.'; }
    if (args.startsWith('remove ')) { const index = Number(args.slice(7)) - 1; const rules = readPolicy().rules; if (!Number.isInteger(index) || !rules[index]) throw new Error('Укажи номер правила.'); rules.splice(index, 1); updatePolicy({ rules }); return 'Правило удалено.'; }
    if (args && args !== 'list') throw new Error('/permissions allow|deny TOOL EXACT_COMMAND · /permissions remove N');
    return readPolicy().rules.map((r,i) => `${i + 1}. ${r.action} ${r.tool || '*'} ${r.subject || r.pattern || '*'}`).join('\n') || 'Правил нет. Опасные команды требуют подтверждения.';
  });
  command('sound', 'on/off, volume 0–100, test — звуки уведомлений', args => {
    if (['on','off'].includes(args)) updatePolicy({ sounds: args === 'on' });
    else if (args.startsWith('volume ')) { const n = Number(args.slice(7)); if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Громкость от 0 до 100.'); updatePolicy({ volume: n / 100 }); }
    else if (args === 'test') { playSound('complete', { ...readPolicy(), sounds: true }); setTimeout(() => playSound('attention', { ...readPolicy(), sounds: true }), 1000).unref(); }
    else if (args) throw new Error('/sound on|off|volume 0–100|test');
    const policy = readPolicy(); return `Звуки ${policy.sounds ? 'включены' : 'выключены'}, громкость ${Math.round(policy.volume * 100)}%.`;
  });
  command('doctor', 'Проверить готовность ядра, ключей, браузера, экрана и GitHub', (_args, ctx) => {
    const env = inspectEnvironment(); return [
      `✓ Node ${process.version}`, `${ctx.model && ctx.modelRegistry.hasConfiguredAuth(ctx.model) ? '✓' : '!'} ключ текущей модели`,
      `${browserExecutable() ? '✓' : '!'} браузер: ${browserExecutable() || 'установи Chrome/Chromium'}`,
      `${env.screenshot.length ? '✓' : '!'} снимки: ${env.screenshot.join(', ') || 'не найден backend'}`,
      `${env.input ? '✓' : '!'} ввод: ${env.input || 'нужен xdotool/ydotool/cliclick'}`,
      `${findExecutable('gh') ? '✓' : '!'} GitHub CLI gh (авторизация проверяется через gh auth status)`,
      `Настройки: ${path.join(nativeRoot(), 'policy.json')}`,
    ].join('\n');
  });
  command('hooks', 'Настроенные команды на tool_result и agent_end', () => `${readPolicy().hooks.map(h => `${h.event} ${h.tool || '*'} → ${h.command}`).join('\n') || 'Хуки не настроены.'}\nФайл: ${path.join(nativeRoot(), 'policy.json')}\nПример: "hooks": [{"event":"agent_end","command":"your-command"}]`);
  command('keys', 'Добавить, заменить или удалить ключ провайдера', async (_args, ctx) => {
    if (!ctx.hasUI) throw new Error('/keys требует интерактивного режима.');
    const providers = [...new Set(ctx.modelRegistry.getAll().map(model => model.provider))];
    const provider = await ctx.ui.select('Провайдер', providers); if (!provider) return;
    const action = await ctx.ui.select(provider, ['Добавить / заменить ключ', 'Удалить ключ', 'Отмена']);
    const storage = ctx.modelRegistry.authStorage;
    if (action === 'Удалить ключ') { if (await ctx.ui.confirm('Удалить ключ', provider)) { storage.remove(provider); return 'Ключ удалён.'; } }
    else if (action === 'Добавить / заменить ключ') { const key = await secretInput(ctx, `Ключ ${provider} (ввод скрыт)`); if (key) { storage.set(provider, { type: 'api_key', key }); return 'Ключ сохранён.'; } }
  });
  command('rename', 'Переименовать текущий диалог', args => { if (!args) throw new Error('/rename Название'); operator.setSessionName(args); return `Название: ${args}`; });
  command('compact', 'Сжать контекст текущего диалога', (_args, ctx) => { ctx.compact(); });
  command('features', 'Встроенные возможности CLI', () => '/autopilot on|off · /undo · /changes · /jobs [ID|stop ID] · /agents · /chat · /permissions · /doctor · /keys · /sound · /rename · /compact\nВложения: @путь/к/файлу или вставка изображения; история: /resume; экспорт: /export.');
}

import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { OperatorLine } from './rpc.js';

const cli = fileURLToPath(new URL('../../cli.js', import.meta.url));
export class ChatHub {
  chats = new Map();
  constructor(context, notify) { this.context = context; this.notify = notify; }
  async close() { for (const chat of this.chats.values()) chat.line.stop(); this.chats.clear(); }
  async command(args, ctx) {
    const [action = 'list', id, ...rest] = args.trim().split(/\s+/);
    if (action === 'new') {
      const prompt = [id, ...rest].filter(Boolean).join(' '); if (!prompt) throw new Error('/chat new <задание>');
      if (this.chats.size >= 8) throw new Error('Лимит 8 диалогов. Закрой ненужный через /chat close ID.');
      const key = crypto.randomUUID().slice(0, 8);
      const line = new OperatorLine(key, { bin: process.execPath, prefixArgs: [cli], cwd: ctx.cwd, model: ctx.model?.id, provider: ctx.model?.provider, env: { OPERATOR_CHILD_CHAT: '1' } });
      const chat = { id: key, line, title: prompt.slice(0, 60), status: 'запуск', events: [], pending: [] };
      this.chats.set(key, chat);
      line.on('event', event => {
        if (event.type === 'agent_start') chat.status = 'работает';
        if (event.type === 'agent_end') {
          const last = [...(event.messages || [])].reverse().find(message => message.role === 'assistant');
          chat.status = last?.stopReason === 'error' ? 'ошибка' : last?.stopReason === 'aborted' ? 'остановлен' : 'готов';
          this.notify(`Диалог ${key}: ${chat.status}. /chat show ${key}`);
        }
        if (event.type === 'extension_ui_request' && ['select','confirm','input','editor'].includes(event.method)) {
          chat.pending.push(event); chat.status = 'ждёт ответа'; this.notify(`Диалог ${key} ждёт ответа: /chat answer ${key}`);
        }
        if (event.type === 'tool_execution_start') chat.events.push(`${event.toolName}: ${JSON.stringify(event.args).slice(0, 300)}`);
        if (event.type === 'message_end' && event.message?.role === 'assistant') chat.events.push(event.message.errorMessage || event.message.content.filter(b => b.type === 'text').map(b => b.text).join('\n'));
        if (chat.events.length > 100) chat.events.shift();
      });
      line.on('fatal', error => { chat.status = 'ошибка'; chat.events.push(error); this.notify(error); });
      line.on('exit', () => { chat.status = 'закрыт'; });
      line.start();
      try { const state = await line.send('get_state'); chat.file = state.sessionFile; }
      catch (error) { line.stop(); this.chats.delete(key); throw error; }
      void line.send('prompt', { message: prompt }).catch(error => { chat.status = 'ошибка'; chat.events.push(error.message); this.notify(error.message); });
      return `Запущен диалог ${key}. /chat show ${key} — результат; /chat send ${key} <сообщение> — уточнение.`;
    }
    if (action === 'list' || !args.trim()) return [...this.chats.values()].map(c => `${c.id} · ${c.status} · ${c.title}`).join('\n') || 'Нет открытых фоновых диалогов. /chat new <задание>';
    const chat = this.chats.get(id); if (!chat) throw new Error('Диалог не найден. /chat list');
    if (action === 'show') return chat.events.join('\n\n') || chat.status;
    if (action === 'send') {
      const message = rest.join(' '); if (!message) throw new Error('Укажи сообщение.');
      const state = await chat.line.send('get_state');
      void chat.line.send(state.isStreaming ? 'steer' : 'prompt', { message }).catch(error => this.notify(error.message));
      return 'Сообщение отправлено.';
    }
    if (action === 'stop') { await chat.line.send('abort'); return 'Работа остановлена, диалог сохранён.'; }
    if (action === 'close') { chat.line.stop(); this.chats.delete(id); return 'Процесс закрыт. История доступна через /resume.'; }
    if (action === 'open') {
      const state = await chat.line.send('get_state');
      if (state.isStreaming) throw new Error('Диалог ещё работает. Сначала /chat stop ID либо дождись завершения.');
      chat.line.stop(); this.chats.delete(id); await ctx.switchSession(state.sessionFile); return 'Диалог открыт.';
    }
    if (action === 'answer') {
      const request = chat.pending.shift(); if (!request) return 'Нет ожидающих вопросов.';
      const title = `[${id}] ${request.title || ''}`;
      let response;
      if (request.method === 'select') { const value = await ctx.ui.select(title, request.options); response = value === undefined ? { cancelled: true } : { value }; }
      else if (request.method === 'confirm') response = { confirmed: await ctx.ui.confirm(title, request.message || '') };
      else { const value = await ctx.ui.input(title, request.placeholder || request.prefill); response = value === undefined ? { cancelled: true } : { value }; }
      chat.line.respondUI(request.id, response); chat.status = 'работает'; return 'Ответ отправлен.';
    }
    throw new Error('/chat new <задача> | list | show ID | send ID <текст> | answer ID | stop ID | open ID | close ID');
  }
}

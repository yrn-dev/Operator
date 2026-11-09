import "node:child_process";
import { spawnPortable } from "./platform.mjs";
import path from "node:path";
import { EventEmitter } from "node:events";
export function pathWithBin(bin) {
    const dir = path.dirname(bin);
    const current = process.env.PATH ?? "";
    return current.split(path.delimiter).includes(dir) ? current : `${dir}${path.delimiter}${current}`;
}
const LONG_COMMANDS = new Set([
    "prompt",
    "compact",
    "bash",
    "switch_session",
    "new_session",
    "fork",
    "navigate_tree",
    "reload"
]);
export function rpcResponseTimeout(type) {
    return LONG_COMMANDS.has(type) ? 600_000 : 30_000;
}
export class OperatorLine extends EventEmitter {
    options;
    id;
    cwd;
    proc = null;
    buffer = "";
    seq = 0;
    pending = new Map();
    stderrTail = [];
    alive = false;
    constructor(id, options){
        super(), this.options = options;
        this.id = id;
        this.cwd = options.cwd;
    }
    start() {
        const args = [
            ...this.options.prefixArgs ?? [],
            "--mode",
            "rpc"
        ];
        if (this.options.provider) args.push("--provider", this.options.provider);
        if (this.options.model) args.push("--model", this.options.model);
        for (const extension of this.options.extensions ?? [])args.push("-e", extension);
        if (this.options.appendPrompt) args.push("--append-system-prompt", this.options.appendPrompt);
        const bin = this.options.bin ?? "opr";
        this.proc = spawnPortable(bin, args, {
            cwd: this.cwd,
            env: {
                ...process.env,
                ...this.options.env,
                NO_COLOR: "1",
                PATH: pathWithBin(bin)
            },
            stdio: [
                "pipe",
                "pipe",
                "pipe"
            ],
            windowsHide: true
        });
        this.alive = true;
        this.proc.stdin.on("error", (error)=>{
            this.alive = false;
            this.rejectPending(error);
        });
        this.proc.stdout.setEncoding("utf8");
        this.proc.stdout.on("data", (chunk)=>this.consume(chunk));
        this.proc.stderr.setEncoding("utf8");
        this.proc.stderr.on("data", (chunk)=>{
            this.stderrTail.push(chunk);
            if (this.stderrTail.length > 50) this.stderrTail.shift();
        });
        this.proc.on("error", (err)=>{
            this.alive = false;
            this.rejectPending(err);
            this.emit("fatal", `не удалось запустить «${bin}»: ${err.message}`);
        });
        this.proc.on("exit", (code)=>{
            this.alive = false;
            const reason = new Error(`линия оборвалась (код ${code ?? "?"})`);
            this.rejectPending(reason);
            this.emit("exit", code, this.stderrTail.join(""));
        });
    }
    rejectPending(reason) {
        for (const p of this.pending.values())p.reject(reason);
        this.pending.clear();
    }
    consume(chunk) {
        this.buffer += chunk;
        let newline;
        while((newline = this.buffer.indexOf("\n")) >= 0){
            const line = this.buffer.slice(0, newline).trim();
            this.buffer = this.buffer.slice(newline + 1);
            if (!line) continue;
            let parsed;
            try {
                parsed = JSON.parse(line);
            } catch  {
                continue;
            }
            this.dispatch(parsed);
        }
    }
    dispatch(message) {
        if (message.type === "response") {
            const id = String(message.id);
            const pending = this.pending.get(id);
            if (!pending) return;
            this.pending.delete(id);
            if (message.success) pending.resolve(message.data);
            else pending.reject(new Error(String(message.error ?? "команда отклонена")));
            return;
        }
        this.emit("event", message);
    }
    get writable() {
        return this.alive && Boolean(this.proc) && !this.proc.stdin.destroyed;
    }
    send(type, payload = {}) {
        if (!this.writable) {
            return Promise.reject(new Error("линия не подключена"));
        }
        const id = `c${++this.seq}`;
        const command = JSON.stringify({
            ...payload,
            id,
            type
        }) + "\n";
        return new Promise((resolve, reject)=>{
            const timeout = this.options.responseTimeoutMs ?? rpcResponseTimeout(type);
            const timer = setTimeout(()=>{
                this.pending.get(id)?.reject(new Error(`Оператор не ответил на «${type}» за ${timeout / 1000} с. Действие могло выполниться; проверьте состояние перед повтором.`));
            }, timeout);
            timer.unref();
            const cleanup = ()=>{
                clearTimeout(timer);
                this.pending.delete(id);
            };
            const fail = (error)=>{
                cleanup();
                reject(error);
            };
            this.pending.set(id, {
                resolve: (value)=>{
                    cleanup();
                    resolve(value);
                },
                reject: fail
            });
            try {
                this.proc.stdin.write(command, (err)=>{
                    if (err) {
                        fail(err);
                    }
                });
            } catch (err) {
                fail(err);
            }
        });
    }
    respondUI(id, payload) {
        if (!this.writable) return;
        try {
            this.proc.stdin.write(JSON.stringify({
                type: "extension_ui_response",
                id,
                ...payload
            }) + "\n");
        } catch  {}
    }
    stop() {
        const reason = new Error("линия закрыта");
        this.rejectPending(reason);
        this.alive = false;
        const proc = this.proc;
        this.proc = null;
        if (!proc) return;
        proc.kill();
        setTimeout(()=>{
            if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
        }, 2000).unref();
    }
}

import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { spawnProcess, waitForChildProcess } from "../../utils/child-process.js";
import { getShellEnv } from "../../utils/shell.js";
import { getTextOutput, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from "./truncate.js";

const IS_WINDOWS = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

const appControlSchema = Type.Object({
    action: Type.Union([
        Type.Literal("discover"),
        Type.Literal("capabilities"),
        Type.Literal("run_script"),
    ], { description: "discover: list installed applications and whether they can be scripted. capabilities: how to script one application. run_script: drive an application through its own scripting interface." }),
    app: Type.Optional(Type.String({ description: "Application id or name, e.g. blender, libreoffice, ffmpeg, applescript, powershell" })),
    script: Type.Optional(Type.String({ description: "Script source to run, in the application's own scripting language" })),
    scriptFile: Type.Optional(Type.String({ description: "Path to an existing script file to run instead of inline script" })),
    args: Type.Optional(Type.Array(Type.String({ description: "Argument passed to the application" }), { description: "Extra arguments for the application" })),
    file: Type.Optional(Type.String({ description: "Document or project file to open before running the script" })),
    gui: Type.Optional(Type.Boolean({ description: "Show the application window instead of running headless (default: false)" })),
    filter: Type.Optional(Type.String({ description: "discover: only report applications whose name or id contains this text" })),
    scriptableOnly: Type.Optional(Type.Boolean({ description: "discover: only report applications that expose a scripting interface (default: true)" })),
    timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 120)" })),
}, { additionalProperties: false });

// Applications that expose a real scripting interface. `scriptStyle` says how the
// script reaches the app: a file path argument, an inline string argument, or not at
// all (the app is driven purely by command-line arguments).
const APP_CATALOG = [
    {
        id: "blender",
        name: "Blender",
        language: "python",
        extension: ".py",
        scriptStyle: "file",
        bins: {
            linux: ["blender"],
            darwin: ["blender", "/Applications/Blender.app/Contents/MacOS/Blender"],
            win32: ["blender.exe"],
        },
        docs: "https://docs.blender.org/api/current/",
        // blender [--background] [file.blend] --python script.py -- extra args
        build({ scriptPath, file, args, gui }) {
            const argv = [];
            if (!gui) {
                argv.push("--background");
            }
            if (file) {
                argv.push(file);
            }
            argv.push("--python", scriptPath, "--noaudio");
            if (args.length > 0) {
                argv.push("--", ...args);
            }
            return argv;
        },
        example: "import bpy\nbpy.ops.mesh.primitive_cube_add(size=2)\nbpy.ops.wm.save_as_mainfile(filepath='/tmp/cube.blend')",
    },
    {
        id: "freecad",
        name: "FreeCAD",
        language: "python",
        extension: ".py",
        scriptStyle: "file",
        bins: {
            linux: ["freecadcmd", "FreeCADCmd", "freecad"],
            darwin: ["FreeCADCmd", "/Applications/FreeCAD.app/Contents/MacOS/FreeCADCmd"],
            win32: ["FreeCADCmd.exe"],
        },
        docs: "https://wiki.freecad.org/Power_users_hub",
        build({ scriptPath, args }) {
            return [scriptPath, ...args];
        },
        example: "import FreeCAD\ndoc = FreeCAD.newDocument('demo')\ndoc.saveAs('/tmp/demo.FCStd')",
    },
    {
        id: "inkscape",
        name: "Inkscape",
        language: "inkscape-actions",
        scriptStyle: "inline",
        bins: {
            linux: ["inkscape"],
            darwin: ["inkscape", "/Applications/Inkscape.app/Contents/MacOS/inkscape"],
            win32: ["inkscape.exe"],
        },
        docs: "https://inkscape.org/doc/inkscape-man.html",
        build({ scriptText, file, args }) {
            const argv = [];
            if (file) {
                argv.push(file);
            }
            argv.push(`--actions=${scriptText}`, ...args);
            return argv;
        },
        example: "select-all;object-to-path;export-filename:/tmp/out.png;export-do",
    },
    {
        id: "gimp",
        name: "GIMP",
        language: "script-fu",
        scriptStyle: "inline",
        bins: {
            linux: ["gimp-console", "gimp"],
            darwin: ["gimp-console", "/Applications/GIMP.app/Contents/MacOS/gimp-console"],
            win32: ["gimp-console.exe", "gimp-2.10.exe"],
        },
        docs: "https://www.gimp.org/docs/script-fu/",
        build({ scriptText, args }) {
            return ["-i", "-b", scriptText, "-b", "(gimp-quit 0)", ...args];
        },
        example: "(let* ((img (car (gimp-file-load RUN-NONINTERACTIVE \"/tmp/in.png\" \"in.png\")))) (gimp-image-flatten img))",
    },
    {
        id: "libreoffice",
        name: "LibreOffice",
        language: "cli",
        scriptStyle: "args-only",
        bins: {
            linux: ["soffice", "libreoffice"],
            darwin: ["soffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice"],
            win32: ["soffice.exe"],
        },
        docs: "https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html",
        build({ file, args, gui }) {
            const argv = gui ? ["--norestore"] : ["--headless", "--norestore"];
            if (file) {
                argv.push(file);
            }
            return [...argv, ...args];
        },
        example: "args: [\"--convert-to\", \"pdf\", \"--outdir\", \"/tmp\", \"/tmp/doc.odt\"]",
    },
    {
        id: "ffmpeg",
        name: "FFmpeg",
        language: "cli",
        scriptStyle: "args-only",
        bins: { linux: ["ffmpeg"], darwin: ["ffmpeg"], win32: ["ffmpeg.exe"] },
        docs: "https://ffmpeg.org/ffmpeg.html",
        build({ args }) {
            return [...args];
        },
        example: "args: [\"-i\", \"in.mp4\", \"-vf\", \"scale=1280:-2\", \"out.mp4\"]",
    },
    {
        id: "imagemagick",
        name: "ImageMagick",
        language: "cli",
        scriptStyle: "args-only",
        bins: { linux: ["magick", "convert"], darwin: ["magick", "convert"], win32: ["magick.exe"] },
        docs: "https://imagemagick.org/script/command-line-processing.php",
        build({ args }) {
            return [...args];
        },
        example: "args: [\"in.png\", \"-resize\", \"50%\", \"out.png\"]",
    },
    {
        id: "sqlite3",
        name: "SQLite",
        language: "sql",
        extension: ".sql",
        scriptStyle: "file",
        bins: { linux: ["sqlite3"], darwin: ["sqlite3"], win32: ["sqlite3.exe"] },
        docs: "https://sqlite.org/cli.html",
        build({ scriptPath, file, args }) {
            return [file || ":memory:", `.read ${scriptPath}`, ...args];
        },
        example: "SELECT name FROM sqlite_master WHERE type='table';",
    },
    {
        id: "applescript",
        name: "AppleScript (any scriptable macOS app)",
        language: "applescript",
        extension: ".scpt",
        scriptStyle: "file",
        platforms: ["darwin"],
        bins: { darwin: ["osascript"] },
        docs: "https://developer.apple.com/library/archive/documentation/AppleScript/Conceptual/AppleScriptLangGuide/",
        build({ scriptPath, args }) {
            return [scriptPath, ...args];
        },
        example: "tell application \"Safari\" to make new document with properties {URL:\"https://example.com\"}",
        note: "Drives any macOS app that ships a scripting dictionary, including closed-source ones such as Photoshop, Excel and Finder.",
    },
    {
        id: "powershell",
        name: "PowerShell (any COM-automatable Windows app)",
        language: "powershell",
        extension: ".ps1",
        scriptStyle: "file",
        platforms: ["win32"],
        bins: { win32: ["pwsh.exe", "powershell.exe"] },
        docs: "https://learn.microsoft.com/powershell/",
        build({ scriptPath, args }) {
            return ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args];
        },
        example: "$xl = New-Object -ComObject Excel.Application\n$xl.Visible = $false\n$wb = $xl.Workbooks.Add()\n$wb.SaveAs('C:\\\\temp\\\\demo.xlsx')\n$xl.Quit()",
        note: "COM automation reaches Office, AutoCAD and most Windows desktop software without any GUI clicking.",
    },
    {
        id: "python",
        name: "Python",
        language: "python",
        extension: ".py",
        scriptStyle: "file",
        bins: { linux: ["python3", "python"], darwin: ["python3", "python"], win32: ["python.exe", "py.exe"] },
        docs: "https://docs.python.org/3/",
        build({ scriptPath, args }) {
            return [scriptPath, ...args];
        },
        example: "print('hello')",
    },
    {
        id: "node",
        name: "Node.js",
        language: "javascript",
        extension: ".mjs",
        scriptStyle: "file",
        bins: { linux: ["node"], darwin: ["node"], win32: ["node.exe"] },
        docs: "https://nodejs.org/api/",
        build({ scriptPath, args }) {
            return [scriptPath, ...args];
        },
        example: "console.log('hello')",
    },
];

// Applications that are commonly installed but cannot be driven without clicking.
// Reported by discover so the model does not waste turns trying to script them.
const KNOWN_UI_ONLY = [
    { id: "krita", name: "Krita", bins: ["krita", "krita.exe"], reason: "Python plugins run inside the GUI only; no headless script entry point." },
    { id: "obs", name: "OBS Studio", bins: ["obs", "obs.exe"], reason: "Scripting happens in-app; external control needs the obs-websocket plugin." },
    { id: "audacity", name: "Audacity", bins: ["audacity", "audacity.exe"], reason: "mod-script-pipe must be enabled in preferences first." },
];

function catalogForPlatform() {
    return APP_CATALOG.filter((entry) => !entry.platforms || entry.platforms.includes(process.platform));
}

function binNamesFor(entry) {
    return entry.bins?.[process.platform] ?? [];
}

function pathDirectories(env) {
    const key = Object.keys(env).find((name) => name.toLowerCase() === "path") ?? "PATH";
    return (env[key] ?? "").split(delimiter).filter(Boolean);
}

// Resolve a binary the way a shell would, without spawning one.
function resolveBinary(name, env) {
    if (name.includes("/") || name.includes("\\")) {
        return existsSync(name) ? name : null;
    }
    const extensions = IS_WINDOWS ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean) : [""];
    for (const dir of pathDirectories(env)) {
        for (const ext of extensions) {
            const candidate = join(dir, name.endsWith(ext) ? name : `${name}${ext}`);
            if (existsSync(candidate)) {
                return candidate;
            }
        }
    }
    return null;
}

function resolveApp(entry, env) {
    for (const name of binNamesFor(entry)) {
        const resolved = resolveBinary(name, env);
        if (resolved) {
            return resolved;
        }
    }
    return null;
}

function findCatalogEntry(appName) {
    const needle = String(appName || "").trim().toLowerCase();
    if (!needle) {
        return null;
    }
    return catalogForPlatform().find((entry) => entry.id === needle)
        || catalogForPlatform().find((entry) => entry.name.toLowerCase().includes(needle))
        || catalogForPlatform().find((entry) => binNamesFor(entry).some((bin) => bin.toLowerCase().includes(needle)))
        || null;
}

// ── Installed-application discovery (per platform, read-only) ──

async function readDirSafe(dir) {
    try {
        return await readdir(dir, { withFileTypes: true });
    }
    catch {
        return [];
    }
}

async function discoverLinuxApps() {
    const dirs = [
        "/usr/share/applications",
        "/usr/local/share/applications",
        join(homedir(), ".local/share/applications"),
        "/var/lib/flatpak/exports/share/applications",
        join(homedir(), ".local/share/flatpak/exports/share/applications"),
        "/var/lib/snapd/desktop/applications",
    ];
    const apps = new Map();
    for (const dir of dirs) {
        for (const item of await readDirSafe(dir)) {
            if (!item.isFile() || !item.name.endsWith(".desktop")) {
                continue;
            }
            try {
                const text = await readFile(join(dir, item.name), "utf8");
                if (/^NoDisplay\s*=\s*true/mi.test(text)) {
                    continue;
                }
                const name = text.match(/^Name\s*=\s*(.+)$/m)?.[1]?.trim();
                const exec = text.match(/^Exec\s*=\s*(.+)$/m)?.[1]?.trim();
                if (!name) {
                    continue;
                }
                const command = exec ? exec.split(/\s+/)[0] : "";
                apps.set(name.toLowerCase(), { name, command, source: dir.includes("flatpak") ? "flatpak" : "desktop-entry" });
            }
            catch {
                /* unreadable entry */
            }
        }
    }
    return [...apps.values()];
}

async function discoverMacApps() {
    const apps = [];
    for (const dir of ["/Applications", join(homedir(), "Applications"), "/System/Applications"]) {
        for (const item of await readDirSafe(dir)) {
            if (!item.name.endsWith(".app")) {
                continue;
            }
            const bundle = join(dir, item.name);
            // A scripting dictionary (.sdef) or NSAppleScriptEnabled means the app can
            // be driven with AppleScript, regardless of whether its source is open.
            const resources = await readDirSafe(join(bundle, "Contents", "Resources"));
            let scriptable = resources.some((file) => file.name.endsWith(".sdef"));
            if (!scriptable) {
                try {
                    const plist = await readFile(join(bundle, "Contents", "Info.plist"), "utf8");
                    scriptable = /NSAppleScriptEnabled/.test(plist);
                }
                catch {
                    /* binary plist or unreadable */
                }
            }
            apps.push({
                name: item.name.replace(/\.app$/, ""),
                command: bundle,
                source: "bundle",
                appleScriptable: scriptable,
            });
        }
    }
    return apps;
}

async function discoverWindowsApps() {
    const dirs = [
        join(process.env.ProgramData ?? "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
        join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs"),
    ];
    const apps = new Map();
    const walk = async (dir, depth) => {
        if (depth > 3) {
            return;
        }
        for (const item of await readDirSafe(dir)) {
            const full = join(dir, item.name);
            if (item.isDirectory()) {
                await walk(full, depth + 1);
            }
            else if (item.name.toLowerCase().endsWith(".lnk")) {
                const name = item.name.replace(/\.lnk$/i, "");
                apps.set(name.toLowerCase(), { name, command: full, source: "start-menu" });
            }
        }
    };
    for (const dir of dirs) {
        await walk(dir, 0);
    }
    return [...apps.values()];
}

async function discoverInstalledApps() {
    if (IS_MAC) {
        return discoverMacApps();
    }
    if (IS_WINDOWS) {
        return discoverWindowsApps();
    }
    return discoverLinuxApps();
}

function describeScripting(entry, executable) {
    return {
        id: entry.id,
        name: entry.name,
        installed: Boolean(executable),
        executable: executable || null,
        language: entry.language,
        scriptStyle: entry.scriptStyle,
        docs: entry.docs,
        note: entry.note,
    };
}

async function buildDiscoveryReport(env, filter, scriptableOnly) {
    const needle = String(filter || "").trim().toLowerCase();
    const matches = (text) => !needle || String(text || "").toLowerCase().includes(needle);

    const scriptable = catalogForPlatform()
        .map((entry) => describeScripting(entry, resolveApp(entry, env)))
        .filter((entry) => entry.installed)
        .filter((entry) => matches(entry.name) || matches(entry.id));

    const uiOnly = KNOWN_UI_ONLY
        .map((entry) => ({ ...entry, executable: entry.bins.map((bin) => resolveBinary(bin, env)).find(Boolean) || null }))
        .filter((entry) => entry.executable)
        .filter((entry) => matches(entry.name) || matches(entry.id));

    const installed = (await discoverInstalledApps()).filter((app) => matches(app.name));

    const lines = [];
    lines.push(`Platform: ${process.platform}`);
    lines.push("");
    lines.push(`Scriptable applications (${scriptable.length})`);
    if (scriptable.length === 0) {
        lines.push("- none detected");
    }
    for (const entry of scriptable) {
        lines.push(`- ${entry.id} — ${entry.name}`);
        lines.push(`  language: ${entry.language} | script passed as: ${entry.scriptStyle} | binary: ${entry.executable}`);
        if (entry.note) {
            lines.push(`  note: ${entry.note}`);
        }
    }
    if (uiOnly.length > 0) {
        lines.push("");
        lines.push(`Installed but not scriptable from outside (${uiOnly.length})`);
        for (const entry of uiOnly) {
            lines.push(`- ${entry.name}: ${entry.reason}`);
        }
    }
    if (!scriptableOnly) {
        const shown = installed.slice(0, 200);
        lines.push("");
        lines.push(`Other installed applications (${installed.length}${installed.length > shown.length ? `, showing ${shown.length}` : ""})`);
        for (const app of shown) {
            const flags = app.appleScriptable ? " [AppleScript-able]" : "";
            lines.push(`- ${app.name}${flags}${app.command ? ` (${app.command})` : ""}`);
        }
    }
    lines.push("");
    lines.push("Run one with action=\"run_script\", app=<id>, script=<source in that language>.");
    return { text: lines.join("\n"), scriptable, uiOnly, installedCount: installed.length };
}

function buildCapabilitiesReport(entry, executable) {
    const lines = [];
    lines.push(`${entry.name} (${entry.id})`);
    lines.push(`- installed: ${executable ? `yes — ${executable}` : "no"}`);
    lines.push(`- scripting language: ${entry.language}`);
    lines.push(`- how the script is passed: ${entry.scriptStyle}`);
    lines.push(`- documentation: ${entry.docs}`);
    if (entry.note) {
        lines.push(`- note: ${entry.note}`);
    }
    if (entry.scriptStyle === "args-only") {
        lines.push("- this application takes no script; drive it with the args array");
    }
    lines.push("");
    lines.push("Example:");
    lines.push(entry.example);
    return lines.join("\n");
}

function truncateOutput(text) {
    const truncated = truncateHead(text);
    if (truncated.truncated) {
        return `${truncated.content}\n\n[Truncated: ${formatSize(DEFAULT_MAX_BYTES)} limit]`;
    }
    return text;
}

async function runAppScript(entry, executable, input, cwd, env, signal) {
    const { script, scriptFile, args = [], file, gui = false, timeout = 120 } = input;
    let scriptPath = scriptFile ? String(scriptFile) : "";
    let scriptText = script ? String(script) : "";
    let tempDir = "";

    if (entry.scriptStyle !== "args-only") {
        if (!scriptText && !scriptPath) {
            throw new Error(`${entry.name} needs a script: pass script (inline ${entry.language}) or scriptFile.`);
        }
        if (scriptPath && !existsSync(scriptPath)) {
            throw new Error(`scriptFile not found: ${scriptPath}`);
        }
        if (entry.scriptStyle === "file" && !scriptPath) {
            tempDir = await mkdtemp(join(tmpdir(), "operator-app-"));
            scriptPath = join(tempDir, `script${entry.extension ?? ".txt"}`);
            await writeFile(scriptPath, scriptText, "utf8");
        }
        if (entry.scriptStyle === "inline" && !scriptText) {
            scriptText = await readFile(scriptPath, "utf8");
        }
    }

    const argv = entry.build({ scriptPath, scriptText, file, args: args.map(String), gui });
    const child = spawnProcess(executable, argv, {
        cwd,
        env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: !gui,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutHandle;
    const onAbort = () => {
        if (child.pid) {
            try {
                process.kill(child.pid, "SIGTERM");
            }
            catch {
                /* already gone */
            }
        }
    };
    if (signal) {
        if (signal.aborted) {
            onAbort();
        }
        else {
            signal.addEventListener("abort", onAbort, { once: true });
        }
    }
    if (timeout > 0) {
        timeoutHandle = setTimeout(() => {
            timedOut = true;
            onAbort();
        }, timeout * 1000);
    }
    try {
        child.stdout?.on("data", (chunk) => { stdout += chunk.toString("utf-8"); });
        child.stderr?.on("data", (chunk) => { stderr += chunk.toString("utf-8"); });
        const exitCode = await waitForChildProcess(child);
        if (signal?.aborted) {
            throw new Error("Operation aborted");
        }
        const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
        const output = truncateOutput(combined || "(no output)");
        const command = `${executable} ${argv.join(" ")}`;
        if (timedOut) {
            throw new Error(`${entry.name} timed out after ${timeout}s.\n\n${output}`);
        }
        return {
            content: [{
                type: "text",
                text: `${entry.name} exited with code ${exitCode}.\nCommand: ${command}\n\n${output}`,
            }],
            details: { app: entry.id, exitCode, command, ok: exitCode === 0 },
        };
    }
    finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
        if (signal) {
            signal.removeEventListener("abort", onAbort);
        }
        if (tempDir) {
            await rm(tempDir, { recursive: true, force: true }).catch(() => { });
        }
    }
}

function formatAppControlCall(args, theme) {
    const action = str(args?.action) || "discover";
    const app = str(args?.app);
    return `${theme.fg("toolTitle", theme.bold("app_control"))} ${theme.fg("toolOutput", `[${action}] `)}${theme.fg("accent", app || "")}`;
}

function formatAppControlResult(result, options, theme, showImages) {
    const output = getTextOutput(result, showImages).trim();
    if (!output) {
        return "";
    }
    const lines = output.split("\n");
    const maxLines = options.expanded ? lines.length : 24;
    const shown = lines.slice(0, maxLines);
    const remaining = lines.length - maxLines;
    let text = `\n${shown.map((line) => theme.fg("toolOutput", line)).join("\n")}`;
    if (remaining > 0) {
        text += theme.fg("muted", `\n... (${remaining} more lines)`);
    }
    return text;
}

export function createAppControlToolDefinition(cwd, options) {
    const env = options?.env ?? getShellEnv();
    return {
        name: "app_control",
        label: "app_control",
        description: "Discover installed desktop applications and drive them through their own scripting interfaces (Blender's Python API, LibreOffice, GIMP Script-Fu, Inkscape actions, AppleScript on macOS, PowerShell COM on Windows). Works on Linux, macOS and Windows without extra installs. This is scripting, not GUI clicking: it cannot move the mouse or press on-screen buttons.",
        promptSnippet: "Discover and script desktop applications through their own APIs",
        promptGuidelines: [
            "Call app_control with action=discover first to see which applications are installed and scriptable.",
            "Prefer an application's own scripting API over any GUI approach: it is deterministic and needs no screen access.",
            "Whether an application can be scripted has nothing to do with it being open source — it depends on the interface it exposes.",
            "Applications listed as not scriptable from outside cannot be automated by this tool at all.",
        ],
        parameters: appControlSchema,
        async execute(_toolCallId, input, signal, _onUpdate, _ctx) {
            const action = str(input.action) || "discover";

            if (action === "discover") {
                const report = await buildDiscoveryReport(env, input.filter, input.scriptableOnly !== false);
                return {
                    content: [{ type: "text", text: truncateOutput(report.text) }],
                    details: {
                        platform: process.platform,
                        scriptable: report.scriptable.map((entry) => entry.id),
                        uiOnly: report.uiOnly.map((entry) => entry.id),
                        installedCount: report.installedCount,
                    },
                };
            }

            const appName = str(input.app);
            if (!appName) {
                throw new Error("app is required for this action. Run action=\"discover\" to list available ids.");
            }
            const entry = findCatalogEntry(appName);
            if (!entry) {
                const known = catalogForPlatform().map((item) => item.id).join(", ");
                throw new Error(`Unknown application "${appName}". Known scriptable ids on ${process.platform}: ${known}`);
            }
            const executable = resolveApp(entry, env);

            if (action === "capabilities") {
                return {
                    content: [{ type: "text", text: buildCapabilitiesReport(entry, executable) }],
                    details: { app: entry.id, installed: Boolean(executable), language: entry.language },
                };
            }

            if (action === "run_script") {
                if (!executable) {
                    throw new Error(`${entry.name} is not installed, or its binary is not on PATH (looked for: ${binNamesFor(entry).join(", ")}).`);
                }
                return runAppScript(entry, executable, input, cwd, env, signal);
            }

            throw new Error(`Unknown action: ${action}`);
        },
        renderCall(args, theme, context) {
            const text = context.lastComponent ?? new Text("", 0, 0);
            text.setText(formatAppControlCall(args, theme));
            return text;
        },
        renderResult(result, options, theme, context) {
            const text = context.lastComponent ?? new Text("", 0, 0);
            text.setText(formatAppControlResult(result, options, theme, context.showImages));
            return text;
        },
    };
}

export function createAppControlTool(cwd, options) {
    return wrapToolDefinition(createAppControlToolDefinition(cwd, options));
}

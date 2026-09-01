import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { getAgentDir } from "../../config.js";
import { getTextOutput, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";
const taskPlanSchema = Type.Object({
    goal: Type.String({ description: "High-level goal of the plan" }),
    tasks: Type.Array(Type.String({ description: "A single step/task" }), {
        description: "Ordered list of concrete tasks",
        minItems: 1,
    }),
}, { additionalProperties: false });
const taskUpdateSchema = Type.Object({
    id: Type.Optional(Type.String({ description: "Task ID to update (preferred)" })),
    index: Type.Optional(Type.Number({ description: "1-based task index in the current plan" })),
    status: Type.String({
        description: "New status: pending, doing, done, blocked, skipped",
        pattern: "^(pending|doing|done|blocked|skipped)$",
    }),
}, { additionalProperties: false });
const taskListSchema = Type.Object({}, { additionalProperties: false });
const VALID_STATUSES = new Set(["pending", "doing", "done", "blocked", "skipped"]);
function getTasksPath() {
    return join(getAgentDir(), "tasks.json");
}
async function ensureAgentDir() {
    await mkdir(getAgentDir(), { recursive: true });
}
async function loadTasks() {
    await ensureAgentDir();
    const path = getTasksPath();
    try {
        const raw = await readFile(path, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.tasks)) {
            return parsed;
        }
    }
    catch (err) {
        const code = err?.code;
        if (code !== "ENOENT") {
            throw err;
        }
    }
    return { tasks: [] };
}
async function saveTasks(tasksState) {
    await ensureAgentDir();
    const path = getTasksPath();
    const payload = {
        ...tasksState,
        updatedAt: new Date().toISOString(),
    };
    await writeFile(path, JSON.stringify(payload, null, 2), "utf-8");
}
function makeTaskId(index) {
    const ts = Date.now();
    return `task-${ts}-${index + 1}`;
}
function formatPlan(state) {
    const lines = [];
    if (state.goal) {
        lines.push(`Goal: ${state.goal}`);
    }
    if (!Array.isArray(state.tasks) || state.tasks.length === 0) {
        lines.push("No active plan.");
        return lines.join("\n");
    }
    lines.push("");
    for (let i = 0; i < state.tasks.length; i++) {
        const t = state.tasks[i];
        const marker = t.status === "done"
            ? "[x]"
            : t.status === "doing"
                ? "[→]"
                : t.status === "blocked"
                    ? "[!]"
                    : t.status === "skipped"
                        ? "[-]"
                        : "[ ]";
        lines.push(`${i + 1}. ${marker} ${t.title} (${t.id})`);
    }
    return lines.join("\n");
}
export function createTaskPlanToolDefinition(_cwd, _options) {
    return {
        name: "task_plan",
        label: "task_plan",
        description: "Create or replace the current working plan. Provide a high-level goal and an ordered list of concrete tasks. task_update/task_list can then manage and display the plan.",
        promptSnippet: "Create a structured plan with goal and ordered tasks",
        promptGuidelines: [
            "Use task_plan for complex tasks with 3+ steps",
            "Keep each task concrete and actionable (one file change or one verification)",
            "After task_plan, use task_update(id=..., status='doing') when starting a step and task_update(status='done') when finishing",
        ],
        parameters: taskPlanSchema,
        async execute(_toolCallId, input, _signal, _onUpdate, _ctx) {
            const { goal, tasks } = input;
            const planTasks = tasks.map((title, idx) => ({
                id: makeTaskId(idx),
                title,
                status: "pending",
                createdAt: new Date().toISOString(),
            }));
            const state = { goal, tasks: planTasks };
            await saveTasks(state);
            return {
                content: [
                    { type: "text", text: `Plan created with ${planTasks.length} task(s).\n\n${formatPlan(state)}` },
                ],
                details: { goal, tasks: planTasks },
            };
        },
        renderCall(args, theme, _context) {
            const text = new Text("", 0, 0);
            const goal = str(args?.goal);
            text.setText(theme.fg("toolTitle", theme.bold("task_plan")) +
                (goal ? theme.fg("accent", ` ${goal}`) : ""));
            return text;
        },
        renderResult(result, _options, _theme, _context) {
            const text = new Text("", 0, 0);
            text.setText(getTextOutput(result, false));
            return text;
        },
    };
}
export function createTaskUpdateToolDefinition(_cwd, _options) {
    return {
        name: "task_update",
        label: "task_update",
        description: "Update the status of a task in the current plan by id or 1-based index. Statuses: pending, doing, done, blocked, skipped.",
        promptSnippet: "Update task status in the current plan",
        promptGuidelines: [
            "Use task_update immediately when starting or finishing a step",
            "Prefer updating by id; index is a fallback",
            "Statuses: pending, doing, done, blocked, skipped",
        ],
        parameters: taskUpdateSchema,
        async execute(_toolCallId, input, _signal, _onUpdate, _ctx) {
            const { id, index, status } = input;
            if (!VALID_STATUSES.has(status)) {
                throw new Error(`Invalid status: ${status}. Allowed: ${[...VALID_STATUSES].join(", ")}`);
            }
            const state = await loadTasks();
            if (!Array.isArray(state.tasks) || state.tasks.length === 0) {
                throw new Error("No active plan. Create one with task_plan first.");
            }
            let task;
            if (id) {
                task = state.tasks.find((t) => t.id === id);
                if (!task) {
                    throw new Error(`Task id not found: ${id}`);
                }
            }
            else if (index !== undefined && index !== null) {
                const idx = Number(index);
                if (!Number.isFinite(idx) || idx < 1 || idx > state.tasks.length) {
                    throw new Error(`Invalid task index: ${index}. Plan has ${state.tasks.length} task(s).`);
                }
                task = state.tasks[idx - 1];
            }
            else {
                throw new Error("Provide either id or index to update a task.");
            }
            task.status = status;
            task.updatedAt = new Date().toISOString();
            await saveTasks(state);
            return {
                content: [
                    { type: "text", text: `Updated task ${task.id} to '${status}'.\n\n${formatPlan(state)}` },
                ],
                details: { updatedTask: task },
            };
        },
        renderCall(args, theme, _context) {
            const text = new Text("", 0, 0);
            const id = str(args?.id);
            const idx = args?.index;
            const status = str(args?.status);
            const target = id ? `#${id}` : idx ? `#${idx}` : "...";
            text.setText(theme.fg("toolTitle", theme.bold("task_update")) +
                theme.fg("accent", ` ${target} → ${status || "..."}`));
            return text;
        },
        renderResult(result, _options, _theme, _context) {
            const text = new Text("", 0, 0);
            text.setText(getTextOutput(result, false));
            return text;
        },
    };
}
export function createTaskListToolDefinition(_cwd, _options) {
    return {
        name: "task_list",
        label: "task_list",
        description: "List all tasks in the current plan with their statuses. If no plan exists, report that no plan exists.",
        promptSnippet: "Show the current task plan",
        promptGuidelines: [
            "Use task_list when you need to refresh context about the plan",
            "Call task_list before task_update if you are unsure about task ids",
        ],
        parameters: taskListSchema,
        async execute(_toolCallId, _input, _signal, _onUpdate, _ctx) {
            const state = await loadTasks();
            return {
                content: [
                    { type: "text", text: formatPlan(state) },
                ],
                details: { goal: state.goal, tasks: state.tasks },
            };
        },
        renderCall(_args, theme, _context) {
            const text = new Text("", 0, 0);
            text.setText(theme.fg("toolTitle", theme.bold("task_list")));
            return text;
        },
        renderResult(result, _options, _theme, _context) {
            const text = new Text("", 0, 0);
            text.setText(getTextOutput(result, false));
            return text;
        },
    };
}
export function createTaskPlanTool(_cwd, options) {
    return wrapToolDefinition(createTaskPlanToolDefinition(_cwd, options));
}
export function createTaskUpdateTool(_cwd, options) {
    return wrapToolDefinition(createTaskUpdateToolDefinition(_cwd, options));
}
export function createTaskListTool(_cwd, options) {
    return wrapToolDefinition(createTaskListToolDefinition(_cwd, options));
}
//# sourceMappingURL=task-plan.js.map

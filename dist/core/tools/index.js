export { createBashTool, createBashToolDefinition, createLocalBashOperations, } from "./bash.js";
export { createEditTool, createEditToolDefinition, } from "./edit.js";
export { withFileMutationQueue } from "./file-mutation-queue.js";
export { createFindTool, createFindToolDefinition, } from "./find.js";
export { createGitCommitTool, createGitCommitToolDefinition, createGitDiffTool, createGitDiffToolDefinition, createGitStatusTool, createGitStatusToolDefinition, } from "./git-tools.js";
export { createGrepTool, createGrepToolDefinition, } from "./grep.js";
export { createLsTool, createLsToolDefinition, } from "./ls.js";
export { createMemoryRecallTool, createMemoryRecallToolDefinition, createMemoryStoreTool, createMemoryStoreToolDefinition, } from "./memory.js";
export { createPatchTool, createPatchToolDefinition, } from "./patch.js";
export { createReadTool, createReadToolDefinition, } from "./read.js";
export { createReadFullTool, createReadFullToolDefinition, } from "./read-full.js";
export { createDeepResearchTool, createDeepResearchToolDefinition, } from "./deep-research.js";
export { createTaskListTool, createTaskListToolDefinition, createTaskPlanTool, createTaskPlanToolDefinition, createTaskUpdateTool, createTaskUpdateToolDefinition, } from "./task-plan.js";
export { createTestRunTool, createTestRunToolDefinition, } from "./test-run.js";
export { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead, truncateLine, truncateTail, } from "./truncate.js";
export { createWebSearchTool, createWebSearchToolDefinition, } from "./web-search.js";
export { createWriteTool, createWriteToolDefinition, } from "./write.js";
import { createBashTool, createBashToolDefinition } from "./bash.js";
import { createEditTool, createEditToolDefinition } from "./edit.js";
import { createFindTool, createFindToolDefinition } from "./find.js";
import { createGitCommitTool, createGitCommitToolDefinition, createGitDiffTool, createGitDiffToolDefinition, createGitStatusTool, createGitStatusToolDefinition, } from "./git-tools.js";
import { createGrepTool, createGrepToolDefinition } from "./grep.js";
import { createLsTool, createLsToolDefinition } from "./ls.js";
import { createMemoryRecallTool, createMemoryRecallToolDefinition, createMemoryStoreTool, createMemoryStoreToolDefinition, } from "./memory.js";
import { createPatchTool, createPatchToolDefinition } from "./patch.js";
import { createReadTool, createReadToolDefinition } from "./read.js";
import { createReadFullTool, createReadFullToolDefinition } from "./read-full.js";
import { createDeepResearchTool, createDeepResearchToolDefinition } from "./deep-research.js";
import { createTaskListTool, createTaskListToolDefinition, createTaskPlanTool, createTaskPlanToolDefinition, createTaskUpdateTool, createTaskUpdateToolDefinition, } from "./task-plan.js";
import { createTestRunTool, createTestRunToolDefinition } from "./test-run.js";
import { createWebSearchTool, createWebSearchToolDefinition } from "./web-search.js";
import { createWriteTool, createWriteToolDefinition } from "./write.js";
export const allToolNames = new Set(["read", "read_full", "bash", "edit", "patch", "write", "grep", "find", "ls", "web_search", "deep_research", "task_plan", "task_update", "task_list", "memory_store", "memory_recall", "test_run", "git_status", "git_diff", "git_commit"]);
export function createToolDefinition(toolName, cwd, options) {
    switch (toolName) {
        case "read":
            return createReadToolDefinition(cwd, options?.read);
        case "read_full":
            return createReadFullToolDefinition(cwd, options?.read_full);
        case "bash":
            return createBashToolDefinition(cwd, options?.bash);
        case "edit":
            return createEditToolDefinition(cwd, options?.edit);
        case "patch":
            return createPatchToolDefinition(cwd, options?.patch);
        case "write":
            return createWriteToolDefinition(cwd, options?.write);
        case "grep":
            return createGrepToolDefinition(cwd, options?.grep);
        case "find":
            return createFindToolDefinition(cwd, options?.find);
        case "ls":
            return createLsToolDefinition(cwd, options?.ls);
        case "web_search":
            return createWebSearchToolDefinition(cwd, options?.web_search);
        case "deep_research":
            return createDeepResearchToolDefinition(cwd, options?.deep_research);
        case "task_plan":
            return createTaskPlanToolDefinition(cwd, options?.task_plan);
        case "task_update":
            return createTaskUpdateToolDefinition(cwd, options?.task_update);
        case "task_list":
            return createTaskListToolDefinition(cwd, options?.task_list);
        case "memory_store":
            return createMemoryStoreToolDefinition(cwd, options?.memory_store);
        case "memory_recall":
            return createMemoryRecallToolDefinition(cwd, options?.memory_recall);
        case "test_run":
            return createTestRunToolDefinition(cwd, options?.test_run);
        case "git_status":
            return createGitStatusToolDefinition(cwd, options?.git_status);
        case "git_diff":
            return createGitDiffToolDefinition(cwd, options?.git_diff);
        case "git_commit":
            return createGitCommitToolDefinition(cwd, options?.git_commit);
        default:
            throw new Error(`Unknown tool name: ${toolName}`);
    }
}
export function createTool(toolName, cwd, options) {
    switch (toolName) {
        case "read":
            return createReadTool(cwd, options?.read);
        case "read_full":
            return createReadFullTool(cwd, options?.read_full);
        case "bash":
            return createBashTool(cwd, options?.bash);
        case "edit":
            return createEditTool(cwd, options?.edit);
        case "patch":
            return createPatchTool(cwd, options?.patch);
        case "write":
            return createWriteTool(cwd, options?.write);
        case "grep":
            return createGrepTool(cwd, options?.grep);
        case "find":
            return createFindTool(cwd, options?.find);
        case "ls":
            return createLsTool(cwd, options?.ls);
        case "web_search":
            return createWebSearchTool(cwd, options?.web_search);
        case "deep_research":
            return createDeepResearchTool(cwd, options?.deep_research);
        case "task_plan":
            return createTaskPlanTool(cwd, options?.task_plan);
        case "task_update":
            return createTaskUpdateTool(cwd, options?.task_update);
        case "task_list":
            return createTaskListTool(cwd, options?.task_list);
        case "memory_store":
            return createMemoryStoreTool(cwd, options?.memory_store);
        case "memory_recall":
            return createMemoryRecallTool(cwd, options?.memory_recall);
        case "test_run":
            return createTestRunTool(cwd, options?.test_run);
        case "git_status":
            return createGitStatusTool(cwd, options?.git_status);
        case "git_diff":
            return createGitDiffTool(cwd, options?.git_diff);
        case "git_commit":
            return createGitCommitTool(cwd, options?.git_commit);
        default:
            throw new Error(`Unknown tool name: ${toolName}`);
    }
}
export function createCodingToolDefinitions(cwd, options) {
    return [
        createReadToolDefinition(cwd, options?.read),
        createReadFullToolDefinition(cwd, options?.read_full),
        createGrepToolDefinition(cwd, options?.grep),
        createFindToolDefinition(cwd, options?.find),
        createLsToolDefinition(cwd, options?.ls),
        createBashToolDefinition(cwd, options?.bash),
        createEditToolDefinition(cwd, options?.edit),
        createPatchToolDefinition(cwd, options?.patch),
        createWriteToolDefinition(cwd, options?.write),
        createWebSearchToolDefinition(cwd, options?.web_search),
        createDeepResearchToolDefinition(cwd, options?.deep_research),
        createTaskPlanToolDefinition(cwd, options?.task_plan),
        createTaskUpdateToolDefinition(cwd, options?.task_update),
        createTaskListToolDefinition(cwd, options?.task_list),
        createMemoryStoreToolDefinition(cwd, options?.memory_store),
        createMemoryRecallToolDefinition(cwd, options?.memory_recall),
        createTestRunToolDefinition(cwd, options?.test_run),
        createGitStatusToolDefinition(cwd, options?.git_status),
        createGitDiffToolDefinition(cwd, options?.git_diff),
        createGitCommitToolDefinition(cwd, options?.git_commit),
    ];
}
export function createReadOnlyToolDefinitions(cwd, options) {
    return [
        createReadToolDefinition(cwd, options?.read),
        createReadFullToolDefinition(cwd, options?.read_full),
        createGrepToolDefinition(cwd, options?.grep),
        createFindToolDefinition(cwd, options?.find),
        createLsToolDefinition(cwd, options?.ls),
    ];
}
export function createAllToolDefinitions(cwd, options) {
    return {
        read: createReadToolDefinition(cwd, options?.read),
        read_full: createReadFullToolDefinition(cwd, options?.read_full),
        bash: createBashToolDefinition(cwd, options?.bash),
        edit: createEditToolDefinition(cwd, options?.edit),
        patch: createPatchToolDefinition(cwd, options?.patch),
        write: createWriteToolDefinition(cwd, options?.write),
        grep: createGrepToolDefinition(cwd, options?.grep),
        find: createFindToolDefinition(cwd, options?.find),
        ls: createLsToolDefinition(cwd, options?.ls),
        web_search: createWebSearchToolDefinition(cwd, options?.web_search),
        deep_research: createDeepResearchToolDefinition(cwd, options?.deep_research),
        task_plan: createTaskPlanToolDefinition(cwd, options?.task_plan),
        task_update: createTaskUpdateToolDefinition(cwd, options?.task_update),
        task_list: createTaskListToolDefinition(cwd, options?.task_list),
        memory_store: createMemoryStoreToolDefinition(cwd, options?.memory_store),
        memory_recall: createMemoryRecallToolDefinition(cwd, options?.memory_recall),
        test_run: createTestRunToolDefinition(cwd, options?.test_run),
        git_status: createGitStatusToolDefinition(cwd, options?.git_status),
        git_diff: createGitDiffToolDefinition(cwd, options?.git_diff),
        git_commit: createGitCommitToolDefinition(cwd, options?.git_commit),
    };
}
export function createCodingTools(cwd, options) {
    return [
        createReadTool(cwd, options?.read),
        createReadFullTool(cwd, options?.read_full),
        createGrepTool(cwd, options?.grep),
        createFindTool(cwd, options?.find),
        createLsTool(cwd, options?.ls),
        createBashTool(cwd, options?.bash),
        createEditTool(cwd, options?.edit),
        createPatchTool(cwd, options?.patch),
        createWriteTool(cwd, options?.write),
        createWebSearchTool(cwd, options?.web_search),
        createDeepResearchTool(cwd, options?.deep_research),
        createTaskPlanTool(cwd, options?.task_plan),
        createTaskUpdateTool(cwd, options?.task_update),
        createTaskListTool(cwd, options?.task_list),
        createMemoryStoreTool(cwd, options?.memory_store),
        createMemoryRecallTool(cwd, options?.memory_recall),
        createTestRunTool(cwd, options?.test_run),
        createGitStatusTool(cwd, options?.git_status),
        createGitDiffTool(cwd, options?.git_diff),
        createGitCommitTool(cwd, options?.git_commit),
    ];
}
export function createReadOnlyTools(cwd, options) {
    return [
        createReadTool(cwd, options?.read),
        createReadFullTool(cwd, options?.read_full),
        createGrepTool(cwd, options?.grep),
        createFindTool(cwd, options?.find),
        createLsTool(cwd, options?.ls),
    ];
}
export function createAllTools(cwd, options) {
    return {
        read: createReadTool(cwd, options?.read),
        read_full: createReadFullTool(cwd, options?.read_full),
        bash: createBashTool(cwd, options?.bash),
        edit: createEditTool(cwd, options?.edit),
        patch: createPatchTool(cwd, options?.patch),
        write: createWriteTool(cwd, options?.write),
        grep: createGrepTool(cwd, options?.grep),
        find: createFindTool(cwd, options?.find),
        ls: createLsTool(cwd, options?.ls),
        web_search: createWebSearchTool(cwd, options?.web_search),
        deep_research: createDeepResearchTool(cwd, options?.deep_research),
        task_plan: createTaskPlanTool(cwd, options?.task_plan),
        task_update: createTaskUpdateTool(cwd, options?.task_update),
        task_list: createTaskListTool(cwd, options?.task_list),
        memory_store: createMemoryStoreTool(cwd, options?.memory_store),
        memory_recall: createMemoryRecallTool(cwd, options?.memory_recall),
        test_run: createTestRunTool(cwd, options?.test_run),
        git_status: createGitStatusTool(cwd, options?.git_status),
        git_diff: createGitDiffTool(cwd, options?.git_diff),
        git_commit: createGitCommitTool(cwd, options?.git_commit),
    };
}
//# sourceMappingURL=index.js.map

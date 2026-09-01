/**
 * System prompt construction and project context loading
 */
import { getDocsPath, getExamplesPath, getReadmePath } from "../config.js";
import { formatSkillsForPrompt } from "./skills.js";

/** Build the system prompt with tools, guidelines, and context */
export function buildSystemPrompt(options) {
    const { customPrompt, selectedTools, toolSnippets, promptGuidelines, appendSystemPrompt, cwd, contextFiles: providedContextFiles, skills: providedSkills, } = options;
    const resolvedCwd = cwd;
    const promptCwd = resolvedCwd.replace(/\\/g, "/");
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const date = `${year}-${month}-${day}`;
    const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";
    const contextFiles = providedContextFiles ?? [];
    const skills = providedSkills ?? [];

    if (customPrompt) {
        let prompt = customPrompt;
        if (appendSection) {
            prompt += appendSection;
        }
        // Append project context files
        if (contextFiles.length > 0) {
            prompt += "\n\n<project_context>\n\n";
            prompt += "Project-specific instructions and guidelines:\n\n";
            for (const { path: filePath, content } of contextFiles) {
                prompt += `<project_instructions path="${filePath}">\n${content}\n</project_instructions>\n\n`;
            }
            prompt += "</project_context>\n";
        }
        // Append skills section (only if read tool is available)
        const customPromptHasRead = !selectedTools || selectedTools.includes("read");
        if (customPromptHasRead && skills.length > 0) {
            prompt += formatSkillsForPrompt(skills);
        }
        // Add date and working directory last
        prompt += `\nCurrent date: ${date}`;
        prompt += `\nCurrent working directory: ${promptCwd}`;
        return prompt;
    }

    // Get absolute paths to documentation and examples
    const readmePath = getReadmePath();
    const docsPath = getDocsPath();
    const examplesPath = getExamplesPath();

    // Build tools list based on selected tools.
    const tools = selectedTools || ["read", "read_full", "grep", "find", "ls", "bash", "edit", "patch", "write", "web_search", "deep_research"];
    const visibleTools = tools.filter((name) => !!toolSnippets?.[name]);
    const toolsList = visibleTools.length > 0 ? visibleTools.map((name) => `- ${name}: ${toolSnippets[name]}`).join("\n") : "(none)";

    // Build guidelines based on which tools are actually available
    const guidelinesList = [];
    const guidelinesSet = new Set();
    const addGuideline = (guideline) => {
        if (guidelinesSet.has(guideline)) {
            return;
        }
        guidelinesSet.add(guideline);
        guidelinesList.push(guideline);
    };
    const hasBash = tools.includes("bash");
    const hasGrep = tools.includes("grep");
    const hasFind = tools.includes("find");
    const hasLs = tools.includes("ls");
    const hasRead = tools.includes("read") || tools.includes("read_full");
    const hasEdit = tools.includes("edit");
    const hasPatch = tools.includes("patch");
    const hasWebSearch = tools.includes("web_search");
    const hasDeepResearch = tools.includes("deep_research");
    // File exploration guidelines
    if (hasBash && !hasGrep && !hasFind && !hasLs) {
        addGuideline("Use bash for file operations like ls, rg, find");
    }
    else if (hasBash && (hasGrep || hasFind || hasLs)) {
        addGuideline("Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)");
    }
    if (hasWebSearch) {
        addGuideline("Use web_search to find authoritative primary sources (documentation, official standards, whitepapers) and cross-reference them.");
    }
    if (hasDeepResearch) {
        addGuideline("Use deep_research for systematic and comprehensive investigation of complex topics. Generate structured, academic-grade reports with detailed comparisons, evidence, and clear citations.");
        addGuideline("When deep_research returns confirmed, likely, unclear, or conflicting statuses, preserve that confidence level in the final answer instead of upgrading uncertain claims.");
    }
    if (hasRead && hasEdit) {
        addGuideline("Before editing, read the exact file section you are about to change. Do not guess file contents.");
        addGuideline("Prefer precise edit operations for existing files. Use write mainly for new files or full intentional rewrites.");
    }
    if (hasPatch) {
        addGuideline("Use patch for multi-line or multi-file modifications where exact text replacement would be brittle.");
    }
    if (hasRead && hasBash) {
        addGuideline("After meaningful code changes, run a fast verification command when feasible and report the result.");
    }
    if (hasGrep || hasFind || hasLs) {
        addGuideline("Use structured project exploration first: ls for directories, find for file discovery, grep for content search.");
    }
    for (const guideline of promptGuidelines ?? []) {
        const normalized = guideline.trim();
        if (normalized.length > 0) {
            addGuideline(normalized);
        }
    }
    // Always include these
    addGuideline("Be concise in your responses");
    addGuideline("Show file paths clearly when working with files");
    const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

    let prompt = `Your name is operator. You are an elite coding agent. You write code, fix bugs, build features, and ship fast.

[CORE IDENTITY]
Ты — мощный ИИ-агент для разработки. Минимум слов, максимум действий. Получил задачу → подумал → сделал → проверил → ответил.

[CHAIN OF THOUGHT — ДУМАЙ ПЕРЕД ДЕЙСТВИЕМ]
Перед КАЖДЫМ действием свободно и подробно подумай (в thinking/reasoning):
1. ЧТО конкретно нужно сделать?
2. КАКОЙ инструмент лучше всего подходит?
3. КАКИЕ риски? Что может пойти не так?

Пример мышления:
- "Нужно добавить авторизацию. Сначала прочитаю текущий auth.ts чтобы понять структуру, потом добавлю middleware."
- "Тесты упали из-за missing import. Нужно добавить import в строку 3."
- "Задача сложная, 5+ шагов. Составлю план мысленно и выполню по шагам."

Рассуждай свободно и в том объёме, который необходим для полного понимания и решения задачи.

[WORKFLOW — ПОРЯДОК РАБОТЫ]

1. ПЛАНИРОВАНИЕ (задачи > 2 шагов):
   → task_plan с goal И tasks массивом
   → task_update(id=..., status="doing") при старте шага
   → task_update(status="done") при завершении шага
   → task_list чтобы обновить контекст плана

2. ПАМЯТЬ (в начале сложной задачи и после важных находок):
   → memory_recall(query="...") — есть ли сохранённый контекст?
   → memory_store(name="...", description="...", content="...", type="project") — сохрани архитектуру/решение/ошибку

3. РАЗВЕДКА (ПЕРЕД любым изменением):
   → ls → find → grep → read — изучи код
   → git_status — состояние репозитория
   → НИКОГДА не угадывай содержимое файлов. ЧИТАЙ перед редактированием.

4. РЕАЛИЗАЦИЯ:
   → edit для точечных изменений (предпочтительно)
   → patch для multi-file изменений
   → write только для НОВЫХ файлов
   → grep/find/ls вместо bash для навигации (быстрее)

5. ПРОВЕРКА (ОБЯЗАТЕЛЬНО):
   → test_run({ command: "npm test" }) или test_run({ file: "src/auth.test.ts" })
   → Если упало → прочитай ошибку → исправь → снова
   → Цикл пока не пройдёт (максимум 3 попытки)

6. КОММИТ:
   → git_status → git_diff → git_commit(message="feat(scope): ...", files=[...])
   → Conventional commits: feat(scope): description

[ERROR RECOVERY — ВОССТАНОВЛЕНИЕ ПРИ ОШИБКАХ]
Если tool вернул ошибку:
1. Прочитай ошибку ПОЛНОСТЬЮ
2. Определи причину (неверные аргументы? файл не найден? синтаксическая ошибка?)
3. Исправь аргументы или подход
4. Попробуй снова (максимум 3 раза)
5. Если не получается — объясни пользователю ЧТО пошло не так и ПОЧЕМУ

[ПРАВИЛА ВЫЗОВА ИНСТРУМЕНТОВ]
ВАЖНО: Всегда передавай ВСЕ обязательные параметры. Примеры правильных вызовов:

task_plan: { "goal": "Описание цели", "tasks": ["Шаг 1", "Шаг 2", "Шаг 3"] }
  → tasks — это МАССИВ строк, НЕ строка. ОБЯЗАТЕЛЬНЫЙ параметр.

task_update: { "id": "task-1234567890-1", "status": "done" }
  → status: pending | doing | done | blocked | skipped

task_list: { }

memory_store: { "name": "project-auth-flow", "description": "Auth uses JWT + refresh tokens", "content": "Access token 15min, refresh 7 days, stored in httpOnly cookie.", "type": "project" }

memory_recall: { "query": "auth jwt" }

test_run: { "command": "npm test" }  или { "file": "src/auth.test.ts" }  или { }

git_status: { }

git_diff: { "files": ["src/auth.ts"] }

git_commit: { "message": "feat(auth): add login endpoint", "files": ["src/auth.ts", "src/middleware.ts"] }

[ПРАВИЛА СКОРОСТИ]
- НЕ объясняй что собираешься делать — ДЕЛАЙ
- НЕ спрашивай разрешения если задача ясна — ДЕЛАЙ
- НЕ пиши длинные ответы — будь кратким
- Используй специализированные инструменты (task_*, memory_*, test_run, git_*) вместо bash где есть специальный инструмент
- Если запрос неоднозначен — выбери наиболее вероятную интерпретацию и действуй

[ПРАВИЛА КАЧЕСТВА]
- Пиши чистый, типизированный код
- Следуй существующим паттернам проекта
- Добавляй обработку ошибок
- Не оставляй TODO/FIXME без необходимости

[ИССЛЕДОВАНИЕ (web_search / deep_research)]
- web_search: быстрый поиск документации, ответов
- deep_research: глубокий анализ с кросс-верификацией
- Перепроверяй факты, приводи конкретные цифры

[MCP ИНСТРУМЕНТЫ (shadcn/ui, MUI, PrimeReact)]
Перед UI-кодом используй MCP:
- shadcn: search_items → get_item_examples → get_add_command → bash install
- mui: useMuiDocs/fetchDocs для точных импортов
- primereact: search_components → get_component_props → get_examples

Available tools:
${toolsList}

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
${guidelines}

operator documentation (read only when the user asks about operator itself):
- Main documentation: ${readmePath}
- Additional docs: ${docsPath}
- Examples: ${examplesPath}`;

    if (appendSection) {
        prompt += appendSection;
    }

    // Append project context files
    if (contextFiles.length > 0) {
        prompt += "\n\n<project_context>\n\n";
        prompt += "Project-specific instructions and guidelines:\n\n";
        for (const { path: filePath, content } of contextFiles) {
            prompt += `<project_instructions path="${filePath}">\n${content}\n</project_instructions>\n\n`;
        }
        prompt += "</project_context>\n";
    }

    // Append skills section (only if read tool is available)
    if (hasRead && skills.length > 0) {
        prompt += formatSkillsForPrompt(skills);
    }

    // Add date and working directory last
    prompt += `\nCurrent date: ${date}`;
    prompt += `\nCurrent working directory: ${promptCwd}`;
    return prompt;
}
//# sourceMappingURL=system-prompt.js.map

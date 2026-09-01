import { modelsAreEqual } from "@earendil-works/pi-ai";
import { Container, getKeybindings, Input, Spacer, Text, } from "@earendil-works/pi-tui";
import { theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

const ALEM_AI_PROVIDER = "alem-ai";
const OLLAMA_PROVIDER = "ollama";

/** Provider that doesn't need API key */
const NO_AUTH_PROVIDERS = new Set([OLLAMA_PROVIDER]);

/**
 * Model selector — shows models from Alem AI and Ollama.
 * Ollama models don't require API key.
 */
export class ModelSelectorComponent extends Container {
    _focused = false;
    get focused() {
        return this._focused;
    }
    set focused(value) {
        this._focused = value;
        if (this.searchInput) this.searchInput.focused = value;
    }

    searchInput;
    listContainer;
    allModels = [];
    filteredModels = [];
    selectedIndex = 0;
    currentModel;
    settingsManager;
    modelRegistry;
    onSelectCallback;
    onCancelCallback;
    tui;
    mode = "select"; // "select" | "api-key"
    apiKeyInput;
    pendingModel = null;

    constructor(tui, currentModel, settingsManager, modelRegistry, _scopedModels, onSelect, onCancel, _initialSearchInput) {
        super();
        this.tui = tui;
        this.currentModel = currentModel;
        this.settingsManager = settingsManager;
        this.modelRegistry = modelRegistry;
        this.onSelectCallback = onSelect;
        this.onCancelCallback = onCancel;

        // Сначала показываем список моделей
        this.renderSelectMode();
        this.loadModels();
    }

    async loadModels() {
        try {
            this.modelRegistry.refresh();
            const all = await this.modelRegistry.getAll();

            // Сортировка: Alem AI (alem-ai, alem-ai-gpt) → Ollama
            const order = ["alem-ai", "alem-ai-gpt", "ollama"];
            this.allModels = all.sort((a, b) => {
                const ai = order.indexOf(a.provider);
                const bi = order.indexOf(b.provider);
                if (ai >= 0 && bi >= 0) return ai - bi;
                if (ai >= 0) return -1;
                if (bi >= 0) return 1;
                return a.provider.localeCompare(b.provider);
            });
            this.filteredModels = [...this.allModels];

            const currentIdx = this.filteredModels.findIndex(m => modelsAreEqual(this.currentModel, m));
            this.selectedIndex = currentIdx >= 0 ? currentIdx : 0;
            this.updateList();
        } catch (e) {
            // Fallback: build models manually
            this.allModels = this.buildFallbackModels();
            this.filteredModels = [...this.allModels];
            this.selectedIndex = 0;
            this.updateList();
        }
        this.tui.requestRender();
    }

    buildFallbackModels() {
        return [
            { id: "qwen3-8", name: "qwen3-8", provider: ALEM_AI_PROVIDER, api: "openai-completions", baseUrl: "https://llm.alem.ai/v1", reasoning: false, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 262144, maxTokens: 16384, maxImages: 1 },
            { id: "gemma4", name: "gemma4", provider: ALEM_AI_PROVIDER, api: "openai-completions", baseUrl: "https://llm.alem.ai/v1", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 252000, maxTokens: 16384 },
            { id: "gpt-oss", name: "gpt-oss", provider: ALEM_AI_PROVIDER, api: "openai-completions", baseUrl: "https://llm.alem.ai", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384 },
        ];
    }

    renderSelectMode() {
        this.clear();
        this.mode = "select";

        this.addChild(new DynamicBorder());
        this.addChild(new Spacer(1));
        this.addChild(new Text(theme.fg("muted", "  Выберите модель:"), 0, 0));
        this.addChild(new Spacer(1));

        this.searchInput = new Input();
        this.searchInput.onSubmit = () => {
            if (this.filteredModels[this.selectedIndex]) {
                this.handleSelect(this.filteredModels[this.selectedIndex]);
            }
        };
        this.addChild(this.searchInput);
        this.addChild(new Spacer(1));

        this.listContainer = new Container();
        this.addChild(this.listContainer);
        this.addChild(new Spacer(1));
        this.addChild(new DynamicBorder());
    }

    renderApiKeyMode(model) {
        this.clear();
        this.mode = "api-key";
        this.pendingModel = model;

        this.addChild(new DynamicBorder());
        this.addChild(new Spacer(1));
        this.addChild(new Text(theme.bold(theme.fg("accent", `  API Key для ${model.name || model.id}`)), 0, 0));
        this.addChild(new Spacer(1));
        this.addChild(new Text(theme.fg("muted", `  Модель: ${model.id} (${model.name || model.id})`), 0, 0));
        this.addChild(new Text(theme.fg("muted", `  Введите API ключ Alem AI (llm.alem.ai)`), 0, 0));
        this.addChild(new Spacer(1));

        this.apiKeyInput = new Input();
        this.apiKeyInput.onSubmit = () => {
            const key = this.apiKeyInput.getValue().trim();
            if (key) {
                this.saveApiKeyAndSelect(model, key);
            }
        };
        this.addChild(this.apiKeyInput);
        this.addChild(new Spacer(1));
        this.addChild(new Text(theme.fg("dim", "  Enter — сохранить и выбрать · Esc — назад"), 0, 0));
        this.addChild(new DynamicBorder());
    }

    saveApiKeyAndSelect(model, apiKey) {
        try {
            this.modelRegistry.authStorage.set(ALEM_AI_PROVIDER, {
                type: "api_key",
                key: apiKey,
            });
        } catch (e) {
            // Ignore
        }
        this.settingsManager.setDefaultModelAndProvider(model.provider, model.id);
        this.onSelectCallback(model);
    }

    updateList() {
        if (!this.listContainer) return;
        this.listContainer.clear();

        let lastGroup = null;
        for (let i = 0; i < this.filteredModels.length; i++) {
            const m = this.filteredModels[i];

            // Группируем: alem-ai + alem-ai-gpt = "Alem AI"
            let group = m.provider;
            if (m.provider.startsWith("alem-ai")) group = "alem-ai";

            if (group !== lastGroup) {
                lastGroup = group;
                let label = m.provider === "ollama" ? "Ollama" : "Alem AI";
                this.listContainer.addChild(new Text(theme.fg("muted", "  " + label), 0, 0));
                this.listContainer.addChild(new Spacer(1));
            }

            const isSelected = i === this.selectedIndex;
            const isCurrent = this.currentModel && modelsAreEqual(this.currentModel, m);
            const displayName = m.name || m.id;

            let line = "";
            if (isSelected) {
                const checkmark = isCurrent ? theme.fg("success", " ✓") : "";
                const reasoning = m.reasoning ? theme.fg("muted", " · reasoning") : "";
                line = `→ ${theme.fg("accent", m.id)}  ${theme.fg("muted", displayName + reasoning)}${checkmark}`;
            } else {
                const checkmark = isCurrent ? theme.fg("success", " ✓") : "";
                const reasoning = m.reasoning ? theme.fg("muted", " · reasoning") : "";
                line = `  ${m.id}  ${theme.fg("muted", displayName + reasoning)}${checkmark}`;
            }
            this.listContainer.addChild(new Text(line, 0, 0));
        }

        if (this.filteredModels.length === 0) {
            this.listContainer.addChild(new Text(theme.fg("muted", "  Модели не найдены"), 0, 0));
        } else {
            const selected = this.filteredModels[this.selectedIndex];
            this.listContainer.addChild(new Spacer(1));
            const pLabel = selected.provider === "ollama" ? "Ollama" : "Alem AI";
            this.listContainer.addChild(new Text(theme.fg("muted", `  ${selected.name || selected.id} — ${pLabel}`), 0, 0));
        }
    }

    filterModels(query) {
        this.filteredModels = query
            ? this.allModels.filter(m =>
                m.id.toLowerCase().includes(query.toLowerCase()) ||
                (m.name && m.name.toLowerCase().includes(query.toLowerCase()))
            )
            : [...this.allModels];
        this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filteredModels.length - 1));
        this.updateList();
    }

    handleInput(keyData) {
        const kb = getKeybindings();

        if (this.mode === "api-key") {
            if (kb.matches(keyData, "tui.select.cancel")) {
                this.onCancelCallback();
                return;
            }
            this.apiKeyInput?.handleInput(keyData);
            return;
        }

        if (kb.matches(keyData, "tui.select.up")) {
            if (this.filteredModels.length === 0) return;
            this.selectedIndex = this.selectedIndex === 0 ? this.filteredModels.length - 1 : this.selectedIndex - 1;
            this.updateList();
        } else if (kb.matches(keyData, "tui.select.down")) {
            if (this.filteredModels.length === 0) return;
            this.selectedIndex = this.selectedIndex === this.filteredModels.length - 1 ? 0 : this.selectedIndex + 1;
            this.updateList();
        } else if (kb.matches(keyData, "tui.select.confirm")) {
            const selectedModel = this.filteredModels[this.selectedIndex];
            if (selectedModel) {
                this.handleSelect(selectedModel);
            }
        } else if (kb.matches(keyData, "tui.select.cancel")) {
            this.onCancelCallback();
        } else {
            this.searchInput.handleInput(keyData);
            this.filterModels(this.searchInput.getValue());
        }
    }

    async handleSelect(model) {
        // Ollama — без ключа
        if (NO_AUTH_PROVIDERS.has(model.provider)) {
            this.settingsManager.setDefaultModelAndProvider(model.provider, model.id);
            this.onSelectCallback(model);
            return;
        }

        // Alem AI (alem-ai, alem-ai-gpt) — нужен ключ
        const hasAuth = this.modelRegistry.authStorage.hasAuth(ALEM_AI_PROVIDER);
        if (!hasAuth) {
            this.renderApiKeyMode(model);
            this.tui.requestRender();
            return;
        }

        this.settingsManager.setDefaultModelAndProvider(model.provider, model.id);
        this.onSelectCallback(model);
    }

    getSearchInput() {
        return this.searchInput || this.apiKeyInput;
    }
}

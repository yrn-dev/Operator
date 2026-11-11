/**
 * Диалог /keys: текущие API-ключи провайдеров (замаскированные) и
 * возможность заменить или удалить ключ, не вылезая из сессии.
 */
import { Container, Input, Spacer, Text, getKeybindings } from "@earendil-works/pi-tui";
import { theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";
import { keyHint, rawKeyHint } from "./keybinding-hints.js";
export function maskApiKey(key) {
    if (typeof key !== "string" || key.length === 0)
        return undefined;
    if (key.length <= 10)
        return "••••••";
    return `${key.slice(0, 6)}…${key.slice(-4)}`;
}
export class KeysSelectorComponent extends Container {
    tui;
    entries;
    actions;
    onFinish;
    stage = "list";
    selectedIndex = 0;
    actionIndex = 0;
    contentContainer;
    titleText;
    hintText;
    input;
    _focused = false;
    get focused() { return this._focused; }
    set focused(value) {
        this._focused = value;
        if (value && this.stage === "input")
            this.input.focused = true;
    }
    constructor(tui, entries, actions, onFinish, initialIndex = 0, startInActions = false) {
        super();
        this.tui = tui;
        this.entries = entries.map((e) => ({ ...e }));
        this.actions = actions;
        this.onFinish = onFinish;
        this.selectedIndex = Math.min(Math.max(0, initialIndex), Math.max(0, this.entries.length - 1));
        if (startInActions) {
            this.stage = "actions";
            this.actionIndex = 0;
        }
        this.addChild(new DynamicBorder());
        this.addChild(new Spacer(1));
        this.titleText = new Text(theme.fg("accent", theme.bold("API keys")), 1, 0);
        this.addChild(this.titleText);
        this.addChild(new Spacer(1));
        this.contentContainer = new Container();
        this.addChild(this.contentContainer);
        this.addChild(new Spacer(1));
        this.hintText = new Text("", 1, 0);
        this.addChild(this.hintText);
        this.addChild(new Spacer(1));
        this.addChild(new DynamicBorder());
        this.input = new Input();
        this.input.onSubmit = () => {
            const value = this.input.getValue().trim();
            if (!value) {
                this.tui.requestRender();
                return;
            }
            const id = this.entry().id;
            this.input.focused = false;
            this.actions.onSetKey(id, value);
            this.entries[this.selectedIndex] = this.actions.refresh(id);
            this.stage = "list";
            this.renderStage();
            this.onFinish();
        };
        this.input.onEscape = () => {
            this.input.focused = false;
            this.stage = "actions";
            this.renderStage();
        };
        this.renderStage();
    }
    entry() {
        return this.entries[this.selectedIndex];
    }
    keyConfigured(entry) {
        return !!entry && entry.summary !== "not set";
    }
    actionLabels() {
        const labels = ["Set new key"];
        if (this.keyConfigured(this.entry()))
            labels.push("Remove key");
        labels.push("Back");
        return labels;
    }
    renderStage() {
        this.contentContainer.clear();
        if (this.stage === "list") {
            this.titleText.setText(theme.fg("accent", theme.bold("API keys")));
            const width = Math.min(22, Math.max(...this.entries.map((e) => e.name.length)));
            for (let i = 0; i < this.entries.length; i++) {
                const e = this.entries[i];
                const selected = i === this.selectedIndex;
                const marker = selected ? theme.fg("accent", "→ ") : "  ";
                const name = theme.fg(selected ? "accent" : "text", e.name.padEnd(width));
                const summary = e.current
                    ? theme.fg("warning", e.summary) + " " + theme.fg("dim", "(current)")
                    : theme.fg("dim", e.summary);
                this.contentContainer.addChild(new Text(marker + name + "  " + summary, 1, 0));
            }
        }
        else {
            const e = this.entry();
            this.titleText.setText(theme.fg("accent", theme.bold(`Key: ${e.name}`)));
            if (this.stage === "input") {
                this.contentContainer.addChild(new Text(theme.fg("text", "Enter new key: (ввод не маскируется)"), 1, 0));
                this.contentContainer.addChild(this.input);
            }
            else {
                const value = this.keyConfigured(e) ? e.summary : "not set";
                this.contentContainer.addChild(new Text(theme.fg("dim", "Current: ") +
                    (value === "not set" ? theme.fg("warning", "not set") : theme.fg("text", value)), 1, 0));
                this.contentContainer.addChild(new Spacer(1));
                this.actionLabels().forEach((label, i) => {
                    const selected = i === this.actionIndex;
                    const marker = selected ? theme.fg("accent", "→ ") : "  ";
                    this.contentContainer.addChild(new Text(marker + theme.fg(selected ? "accent" : "text", label), 1, 0));
                });
            }
        }
        const hint = this.stage === "list"
            ? rawKeyHint("↑↓", "move") + "  " + keyHint("tui.select.confirm", "select") + "  " + keyHint("tui.select.cancel", "cancel")
            : this.stage === "input"
                ? keyHint("tui.select.confirm", "save") + "  " + keyHint("tui.select.cancel", "cancel")
                : rawKeyHint("↑↓", "move") + "  " + keyHint("tui.select.confirm", "select") + "  " + keyHint("tui.select.cancel", "back");
        this.hintText.setText(theme.fg("dim", hint));
        this.tui.requestRender();
    }
    handleInput(keyData) {
        if (this.stage === "input") {
            this.input.handleInput(keyData);
            return;
        }
        const kb = getKeybindings();
        const isUp = kb.matches(keyData, "tui.select.up") || keyData === "k";
        const isDown = kb.matches(keyData, "tui.select.down") || keyData === "j";
        if (this.stage === "list") {
            if (isUp) {
                this.selectedIndex = Math.max(0, this.selectedIndex - 1);
                this.renderStage();
            }
            else if (isDown) {
                this.selectedIndex = Math.min(this.entries.length - 1, this.selectedIndex + 1);
                this.renderStage();
            }
            else if (kb.matches(keyData, "tui.select.confirm") || keyData === "\n") {
                this.stage = "actions";
                this.actionIndex = 0;
                this.renderStage();
            }
            else if (kb.matches(keyData, "tui.select.cancel")) {
                this.onFinish();
            }
            return;
        }
        const labels = this.actionLabels();
        if (isUp) {
            this.actionIndex = Math.max(0, this.actionIndex - 1);
            this.renderStage();
        }
        else if (isDown) {
            this.actionIndex = Math.min(labels.length - 1, this.actionIndex + 1);
            this.renderStage();
        }
        else if (kb.matches(keyData, "tui.select.confirm") || keyData === "\n") {
            const label = labels[this.actionIndex];
            if (label === "Set new key") {
                this.stage = "input";
                this.input.setValue("");
                this.input.focused = true;
                this.renderStage();
            }
            else if (label === "Remove key") {
                const id = this.entry().id;
                this.actions.onRemoveKey(id);
                this.entries[this.selectedIndex] = this.actions.refresh(id);
                this.stage = "list";
                this.renderStage();
            }
            else {
                this.stage = "list";
                this.renderStage();
            }
        }
        else if (kb.matches(keyData, "tui.select.cancel")) {
            this.stage = "list";
            this.renderStage();
        }
    }
}
//# sourceMappingURL=keys-selector.js.map

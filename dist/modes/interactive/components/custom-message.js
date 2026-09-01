import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";
/**
 * Component that renders a custom message entry from extensions.
 * Uses distinct styling to differentiate from user messages.
 */
export class CustomMessageComponent extends Container {
    message;
    customRenderer;
    customComponent;
    markdownTheme;
    _expanded = false;
    constructor(message, customRenderer, markdownTheme = getMarkdownTheme()) {
        super();
        this.message = message;
        this.customRenderer = customRenderer;
        this.markdownTheme = markdownTheme;
        this.addChild(new Spacer(1));
        this.rebuild();
    }
    setExpanded(expanded) {
        if (this._expanded !== expanded) {
            this._expanded = expanded;
            this.rebuild();
        }
    }
    invalidate() {
        super.invalidate();
        this.rebuild();
    }
    rebuild() {
        this.clear();
        this.addChild(new Spacer(1));
        // Remove previous content component
        if (this.customComponent) {
            this.customComponent = undefined;
        }
        // Try custom renderer first - it handles its own styling
        if (this.customRenderer) {
            try {
                const component = this.customRenderer(this.message, { expanded: this._expanded }, theme);
                if (component) {
                    // Custom renderer provides its own styled component
                    this.customComponent = component;
                    this.addChild(component);
                    return;
                }
            }
            catch {
                // Fall through to default rendering
            }
        }
        // Default rendering: label + content
        const label = theme.fg("customMessageLabel", theme.bold(String(this.message.customType).toUpperCase()));
        this.addChild(new Text(label, 1, 0));
        // Extract text content
        let text;
        if (typeof this.message.content === "string") {
            text = this.message.content;
        }
        else {
            text = this.message.content
                .filter((c) => c.type === "text")
                .map((c) => c.text)
                .join("\n");
        }
        this.addChild(new Markdown(text, 2, 0, this.markdownTheme, {
            color: (text) => theme.fg("customMessageText", text),
        }));
    }
    render(width) {
        const lines = super.render(Math.max(1, width - 2));
        if (lines.length === 0) {
            return lines;
        }
        const rail = (text) => theme.fg("customMessageLabel", text);
        return [
            "",
            rail("╭─ EVENT"),
            ...lines.filter((line) => line.length > 0).map((line) => `${rail("│ ")}${line}`),
            rail("╰"),
        ];
    }
}
//# sourceMappingURL=custom-message.js.map

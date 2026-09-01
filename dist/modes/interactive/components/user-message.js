import { Container, Markdown } from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";
const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
/**
 * Component that renders a user message
 */
export class UserMessageComponent extends Container {
    constructor(text, markdownTheme = getMarkdownTheme()) {
        super();
        this.addChild(new Markdown(text, 0, 0, markdownTheme, {
            color: (content) => theme.fg("userMessageText", content),
        }, { preserveOrderedListMarkers: true }));
    }
    render(width) {
        const lines = super.render(Math.max(1, width - 2));
        if (lines.length === 0) {
            return lines;
        }
        const rail = (text) => theme.fg("accent", text);
        const framed = [
            "",
            rail("╭─ USER"),
            ...lines.map((line) => `${rail("│ ")}${line}`),
            rail("╰"),
        ];
        framed[1] = OSC133_ZONE_START + framed[1];
        framed[framed.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + framed[framed.length - 1];
        return framed;
    }
}
//# sourceMappingURL=user-message.js.map

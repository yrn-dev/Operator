import { Container, type Focusable, type TUI } from "@yernur/operator-tui";
export type ProviderKeyEntry = {
    id: string;
    name: string;
    summary: string;
    current?: boolean;
};
export type KeysSelectorActions = {
    onSetKey: (providerId: string, key: string) => void;
    onRemoveKey: (providerId: string) => void;
    refresh: (providerId: string) => ProviderKeyEntry;
};
/**
 * Mask an API key for display: first 6 + last 4 characters.
 */
export declare function maskApiKey(key: string | undefined): string | undefined;
/**
 * /keys dialog: shows the current API key of each provider (masked)
 * and allows replacing or removing it.
 */
export declare class KeysSelectorComponent extends Container implements Focusable {
    private tui;
    private entries;
    private actions;
    private onFinish;
    private stage;
    private selectedIndex;
    private actionIndex;
    private contentContainer;
    private titleText;
    private hintText;
    private input;
    private _focused;
    get focused(): boolean;
    set focused(value: boolean);
    constructor(tui: TUI, entries: ProviderKeyEntry[], actions: KeysSelectorActions, onFinish: () => void, initialIndex?: number, startInActions?: boolean);
    private entry;
    private keyConfigured;
    private actionLabels;
    private renderStage;
    handleInput(keyData: string): void;
}
//# sourceMappingURL=keys-selector.d.ts.map

/** Provider controls belong on the wire, including explicit thinking=false. */
export function isAlemQwen(model) {
    return model?.provider === "alem-ai" && /^(qwen3-8|qwen3\.8)$/i.test(model.id);
}

export function providerOptions(model, options = {}) {
    const cap = Number.isFinite(model.maxTokens) && model.maxTokens > 0 ? Math.floor(model.maxTokens) : undefined;
    const requested = Number.isFinite(options.maxTokens) && options.maxTokens > 0 ? Math.floor(options.maxTokens) : cap;
    return { ...options,
        ...(model.reasoning ? { reasoning: options.reasoning && options.reasoning !== "off" ? options.reasoning : "high" } : {}),
        maxTokens: cap && requested ? Math.min(cap, requested) : requested,
        onPayload: async (payload, requestModel) => {
            let prepared = payload;
            if (isAlemQwen(model)) {
                prepared = { ...payload, chat_template_kwargs: {
                    ...payload.chat_template_kwargs,
                    enable_thinking: true,
                } };
            }
            return await options.onPayload?.(prepared, requestModel) ?? prepared;
        },
    };
}

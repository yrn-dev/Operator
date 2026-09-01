export function getOperatorUserAgent(version) {
    const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
    return `opr/${version} (${process.platform}; ${runtime}; ${process.arch})`;
}
//# sourceMappingURL=operator-user-agent.js.map

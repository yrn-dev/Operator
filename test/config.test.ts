import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CORE_CONFIG, mergeCoreConfig } from "../src/core/config.ts";

describe("core config", () => {
  it("defaults enable_notifications to false", () => {
    assert.equal(DEFAULT_CORE_CONFIG.enable_notifications, false);
  });

  it("merges partial config without overriding unspecified values", () => {
    assert.deepEqual(mergeCoreConfig({ enable_notifications: true }), {
      enable_notifications: true,
    });
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { notify, setNotificationHandler } from "../src/core/notifications.ts";

describe("notifications", () => {
  it("does not emit when enable_notifications is false", () => {
    let called = false;
    setNotificationHandler(() => {
      called = true;
    });

    const delivered = notify(
      { level: "info", message: "hello" },
      { enable_notifications: false },
    );

    assert.equal(delivered, false);
    assert.equal(called, false);
  });

  it("emits when enable_notifications is true", () => {
    const received: unknown[] = [];
    setNotificationHandler((notification) => {
      received.push(notification);
    });

    const delivered = notify(
      { level: "warn", message: "check logs", context: { code: 1 } },
      { enable_notifications: true },
    );

    assert.equal(delivered, true);
    assert.deepEqual(received, [
      {
        level: "warn",
        message: "check logs",
        context: { code: 1 },
      },
    ]);
  });
});

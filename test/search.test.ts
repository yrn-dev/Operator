import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SearchError, searchItems } from "../src/core/search.ts";

const items = [
  { id: 1, name: "alpha-search" },
  { id: 2, name: "Beta-Search" },
  { id: 3, name: "gamma" },
  { id: 4, name: "search.txt" },
];

describe("searchItems edge cases", () => {
  it("rejects null, undefined, and empty queries", () => {
    assert.throws(() => searchItems(items, null, (item) => item.name), SearchError);
    assert.throws(() => searchItems(items, undefined, (item) => item.name), SearchError);
    assert.throws(
      () => searchItems(items, "   ", (item) => item.name),
      /empty/,
    );
  });

  it("rejects non-string queries", () => {
    assert.throws(
      () => searchItems(items, 42, (item) => item.name),
      /string/,
    );
  });

  it("treats regex metacharacters as literals", () => {
    const result = searchItems(items, "search.txt", (item) => item.name);
    assert.deepEqual(result.items, [{ id: 4, name: "search.txt" }]);
  });

  it("supports case-insensitive search by default", () => {
    const result = searchItems(items, "beta", (item) => item.name);
    assert.deepEqual(result.items, [{ id: 2, name: "Beta-Search" }]);
  });

  it("supports case-sensitive search when requested", () => {
    const result = searchItems(items, "Beta", (item) => item.name, {
      caseSensitive: true,
    });
    assert.deepEqual(result.items, [{ id: 2, name: "Beta-Search" }]);
  });

  it("skips items whose text extractor does not return a string", () => {
    const result = searchItems(
      [{ id: 1, name: "alpha" }, { id: 2, name: null as unknown as string }],
      "alpha",
      (item) => item.name as unknown as string,
    );
    assert.deepEqual(result.items, [{ id: 1, name: "alpha" }]);
  });

  it("truncates results and reports truncation", () => {
    const result = searchItems(items, "search", (item) => item.name, { limit: 1 });
    assert.equal(result.items.length, 1);
    assert.equal(result.truncated, true);
  });

  it("rejects invalid limits", () => {
    assert.throws(
      () => searchItems(items, "search", (item) => item.name, { limit: 0 }),
      /limit/,
    );
  });
});

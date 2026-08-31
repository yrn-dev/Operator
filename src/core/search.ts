export interface SearchOptions {
  caseSensitive?: boolean;
  limit?: number;
}

export interface SearchResult<T> {
  items: T[];
  truncated: boolean;
  query: string;
}

export class SearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchError";
  }
}

function normalizeQuery(query: unknown): string {
  if (query === null || query === undefined) {
    throw new SearchError("query is required");
  }

  if (typeof query !== "string") {
    throw new SearchError("query must be a string");
  }

  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new SearchError("query must not be empty");
  }

  return trimmed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function searchItems<T>(
  items: readonly T[],
  query: unknown,
  getText: (item: T) => string,
  options: SearchOptions = {},
): SearchResult<T> {
  const normalizedQuery = normalizeQuery(query);
  const caseSensitive = options.caseSensitive ?? false;
  const limit = options.limit ?? 100;

  if (!Number.isFinite(limit) || limit < 1) {
    throw new SearchError("limit must be a positive number");
  }

  const pattern = new RegExp(escapeRegExp(normalizedQuery), caseSensitive ? "" : "i");
  const matches: T[] = [];
  let truncated = false;

  for (const item of items) {
    const text = getText(item);
    if (typeof text !== "string") {
      continue;
    }

    if (!pattern.test(text)) {
      continue;
    }

    if (matches.length === limit) {
      truncated = true;
      break;
    }

    matches.push(item);
  }

  return {
    items: matches,
    truncated,
    query: normalizedQuery,
  };
}

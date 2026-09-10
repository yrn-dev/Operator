# Solution for Issue #18863

## 🛠️ Proposed Solution (by Aditya Waghamare)

### Analysis
Core parser error handling currently uses generic error types and catch-all messages, making debugging input validation and payload deserialization issues difficult in production environments.

### Fix
Refactored core parser error handling to provide explicit error contexts, custom error classes with descriptive messages, and robust validation checks.

### Implementation
```typescript
// packages/core/src/parser/errors.ts
export class ParserError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(`[ParserError:${code}] ${message}`);
    this.name = 'ParserError';
    Object.setPrototypeOf(this, ParserError.prototype);
  }
}

// packages/core/src/parser/index.ts
import { ParserError } from './errors';

export function parsePayload<T>(raw: string): T {
  if (!raw || typeof raw !== 'string') {
    throw new ParserError(
      'INVALID_INPUT_TYPE',
      `Expected non-empty string input for parsing, received '${typeof raw}'`,
      { receivedType: typeof raw, value: raw }
    );
  }

  try {
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    const syntaxError = err instanceof Error ? err.message : String(err);
    throw new ParserError(
      'JSON_SYNTAX_ERROR',
      `Failed to parse payload due to invalid JSON syntax: ${syntaxError}`,
      { rawInputPreview: raw.slice(0, 100), syntaxError }
    );
  }
}
```

### Testing
Added comprehensive unit tests covering valid payloads, malformed JSON inputs, empty/null inputs, and checking for expected `ParserError` properties (`code`, `message`, `details`).

Signed-off-by: Aditya Waghamare <adityawaghamare7620@gmail.com>

---
*Submitted by Aditya Waghamare*
💰 **Payout Address (Base L2 / EVM):** `0xb61dBcdBc3407F71EaCb64D4CBFAcf9FFfe2415C`
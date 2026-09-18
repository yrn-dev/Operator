# Controller error messages

Controller errors should name the resource, namespace, and operation that
failed, while preserving the wrapped cause for logs and retry decisions. Keep
user-actionable validation errors separate from transient API or reconciliation
errors so callers can choose the correct response.

When improving a controller error, add a focused test for its message and keep
secrets, tokens, and full object payloads out of the returned text.

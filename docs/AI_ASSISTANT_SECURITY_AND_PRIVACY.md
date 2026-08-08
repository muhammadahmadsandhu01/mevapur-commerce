# AI Assistant Security and Privacy

## Enforced controls

- User and retrieved text are untrusted content, never server policy.
- Fixed server policy rejects secrets, hidden prompts, environment access, raw
  database/query access, another customer’s data, command execution, and write
  operations.
- Only named read-only tools are callable; no user filter is passed to MongoDB.
- Customer record tools derive `userId` only from verified authentication.
- Admin routes use existing `protect` plus `admin` authorization.
- Admin results are aggregates or bounded redacted fields.
- Inputs, history, context items, result counts, query time, total time, and
  request rate are bounded.
- Knowledge responses include sources; unsupported requests do not fabricate.
- Chat history is not persisted and browser UIs use no local/session storage.
- Generic logs include request ID, role, mode, tool names, outcome, and latency,
  never full message/history/tool result.
- Provider mode has no active network adapter in P5C.

## Data minimization

Customer results omit addresses, credentials, tokens, complete payment
references, gateway responses, and unrelated accounts. Admin summaries avoid
raw customer PII. `AI_EXTERNAL_PII_ALLOWED=false` strips context to explicitly
sanitized public fields before any future provider boundary.

No cookies, authorization headers, tokens, private environment values, raw
database records, recovery patches, or private milestone evidence enter the
knowledge index.

## Retention

P5C stores no conversation history or feedback. Normal HTTP/security logs may
retain sanitized metadata under the customer’s approved logging policy.
Customers must define retention, access, deletion, incident response, and
future provider data-processing terms before activation.

## Residual risks and future gate

Deterministic keyword retrieval may miss phrasing and does not reason like a
generative model. Tool results still depend on application/database
availability. A future external provider requires vendor risk, data routing,
cost controls, prompt/context tests, deletion/retention, abuse monitoring,
fallback, and customer approval. Any write tool needs preview, explicit
confirmation, authorization, idempotency, audit, and rollback in a separate
milestone.

# AI Assistant Configuration

| Variable | Meaning | Safe default |
|---|---|---|
| `AI_ASSISTANT_ENABLED` | Explicit assistant gate | `false` |
| `AI_ASSISTANT_MODE` | `disabled`, `retrieval`, `provider` | `disabled` |
| `AI_PROVIDER` | Future registered adapter name | `none` |
| `AI_PROVIDER_BASE_URL` | Future compatible HTTPS endpoint | empty |
| `AI_PROVIDER_API_KEY` | Customer-owned backend secret | absent/secret-store reference |
| `AI_PROVIDER_MODEL` | Customer-approved model identifier | empty |
| `AI_REQUEST_TIMEOUT_MS` | Overall bounded request time, 250–15000 | `5000` |
| `AI_MAX_INPUT_CHARS` | Message/history item limit, 100–4000 | `2000` |
| `AI_MAX_CONTEXT_ITEMS` | Knowledge result limit, 1–10 | `5` |
| `AI_CHAT_HISTORY_PERSIST` | Persistence gate | must remain `false` in P5C |
| `AI_EXTERNAL_PII_ALLOWED` | Future provider PII decision | `false` |

Disabled and retrieval modes need no provider secret. Retrieval requires
`AI_ASSISTANT_ENABLED=true` and `AI_ASSISTANT_MODE=retrieval`. Provider mode
requires an explicit non-`none` adapter name, HTTPS credential-free base URL,
secret API key, and model; even then P5C has no active adapter and makes no
call.

Provider secrets belong only in the backend secret store. No `NEXT_PUBLIC_*`
variable, browser bundle, environment example, log, assistant response, or
documentation may contain a usable key. Configuration errors identify only
the variable and sanitized reason.

Recommended owner demo:

```text
AI_ASSISTANT_ENABLED=true
AI_ASSISTANT_MODE=retrieval
AI_PROVIDER=none
AI_CHAT_HISTORY_PERSIST=false
AI_EXTERNAL_PII_ALLOWED=false
```

Recommended customer production starting state is disabled until retrieval
content and operations are approved. Provider activation is a future separate
milestone.

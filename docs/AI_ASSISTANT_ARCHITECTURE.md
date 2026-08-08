# AI Assistant Architecture

## Accurate product boundary

P5C implements a role-aware **Help Assistant foundation**, not an omniscient
agent. It answers from curated approved knowledge and explicit read-only tools.
It cannot make commercial decisions or mutate the application.

```text
Storefront/Admin UI
        |
        v
Express assistant route -> auth/role + bounds + rate limit
        |
        v
fixed policy -> deterministic retrieval OR allowlisted read-only tool
        |                                  |
        v                                  v
curated index + citations       current-user / aggregate query
        |
        v
sanitized JSON response; metadata-only log
```

## Modes

- `disabled`: safe default; capabilities report unavailable and chat fails
  closed.
- `retrieval`: deterministic token ranking over the curated local index,
  zero network, sources required, and unsupported questions return
  “insufficient information.”
- `provider`: validates customer-owned backend-only configuration, but P5C
  registers no external adapter. Requests fail closed with
  `ASSISTANT_PROVIDER_INACTIVE`; no provider call is possible in P5C.

`AssistantProviderAdapter` and `providerRegistry` define the provider-neutral
boundary. A future milestone may implement one customer-approved compatible
adapter with network, privacy, cost, retry, retention, and vendor tests. The
adapter must not be embedded in Order, Payment, Refund, Inventory, or Auth.

## Module map

- `config/assistant.config.js`: fail-closed mode/limit/provider validation;
- `knowledge/records.json`: reviewed source records;
- `knowledge/index.json`: reproducible deterministic index;
- `knowledge/retrieval.service.js`: audience-filtered ranking;
- `policy/assistantPolicy.js`: fixed server-owned deny policy and provider
  context minimization;
- `tools/assistantReadTools.js`: explicit read-only tool definitions;
- `assistant.service.js`: mode, policy, retrieval/tool orchestration, timeout,
  citations, metadata-only logging;
- controller/routes/validator/optional-auth middleware: HTTP boundaries;
- `scripts/build-assistant-knowledge-index.js`: explicit curated index build.

There is no vector database, embedding request, arbitrary URL fetch,
filesystem tool, command tool, environment tool, streaming channel, or
conversation database.

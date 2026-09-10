# AI Assistant Security and Privacy

## 1. Data Classification Tiers

| Classification Tier | Description & Scope | Access Boundary & Audience |
|---|---|---|
| **Public Catalog Data** | Product names, slugs, categories, short descriptions, public active prices, and general stock availability indicators. | Anonymous, Customer, Admin (`anonymous`, `customer`, `admin`) |
| **Authenticated Customer Data** | Customer's own order history, order tracking status, payment transaction records, and refund requests. | Authenticated Customer only (`customer`, bound strictly to `req.auth.userId`) |
| **Admin Operational Data** | Aggregated order counts, payment status counts, refund summary metrics, inventory aggregates, low-stock alerts, and provider availability configuration. | Authorized Administrators only (`admin`, `super_admin`) |
| **Direct & Indirect PII** | Customer names, email addresses, phone numbers, delivery addresses, order numbers, and courier tracking identifiers. | Strictly minimized; customer queries only access the authenticated user's own data; admin tools expose only aggregated counts; zero cross-tenant access. |
| **Forbidden Secrets & Credentials** | Raw passwords, password hashes, JWT access/refresh tokens, API keys, private keys, database connection strings, environment dumps, full credit/debit card numbers (PAN), and CVV/CVC codes. | **Strictly Prohibited & Denied by Default**. Never requested, processed, persisted, or logged by the assistant. |

## 2. Ownership and RBAC Authorization

- **Deny-by-Default Execution**: Assistant operations are strictly read-only. Write operations (creating/updating orders, processing payments, issuing refunds, modifying inventory) are denied by policy.
- **Tenant & Customer Ownership**: Customer-specific queries derive `userId` solely from the verified JWT authentication context (`req.auth.userId`). No client-supplied user ID or filter is accepted.
- **Role-Based Access Control (RBAC)**: Admin tools and routes require verified JWT authentication with `admin` or `super_admin` role. Unauthorized requests yield standard 401/403 responses.
- **Anonymous Safe Scope**: Unauthenticated users can only access public knowledge base entries and public product search tools. Customer and admin tools are inaccessible to anonymous users.

## 3. Data Minimization & PCI Scope Reduction

- **PCI DSS Scope Reduction**: The assistant never collects, prompts for, handles, transmits, or displays cardholder data (primary account numbers, card verification values, PINs).
- **Masked References**: Payment records expose only masked customer references and high-level provider statuses.
- **Sanitized Outputs**: Error messages, logs, and evidence cards never expose database query syntax, internal collection names, connection strings, or system topology.

## 4. Logging and Redaction Boundaries

- Structured logs record only request metadata: `requestId`, `role`, `mode`, `toolNames`, `outcome`, and `latencyMs`.
- Request bodies, full user prompts, raw tool query results, authentication tokens, and PII are excluded from persistent server logs.
- In policy violations, sanitized error codes (e.g. `ASSISTANT_SECRET_REQUEST_DENIED`) are returned without logging the triggering payload.

## 5. Stateless Architecture & Current Retention

- **Zero Conversation Persistence**: The assistant backend is completely stateless. No chat messages, conversation threads, user prompts, or responses are stored in MongoDB or server memory across requests.
- **Single-Turn Request Contract**: The canonical request contract accepts only `{ "message": "..." }`. Legacy or client-authored `history` payloads are rejected to prevent client-injected prompt injection.
- **Client-Side Session State**: Browser interfaces (Storefront and Admin Panel) maintain messages in volatile React component state during the active session only; no localStorage or persistent cookies are used for assistant conversations.

## 6. Dormant Model-Provider Boundary

- `AI_STUDIO_COOLDOWN_ACTIVE: true`: External LLM adapters remain completely dormant.
- No network requests are made to third-party AI APIs (Google Gemini, OpenAI, Anthropic).
- Provider mode is gated at runtime: attempting to run in provider mode without an active adapter safely fails closed with `ASSISTANT_PROVIDER_INACTIVE`.

## 7. Future Conversation Consent & Deletion Requirements

Prior to any future activation of conversational memory or generative provider integrations:
1. **Explicit Customer Consent**: Users must explicitly opt in to conversation history logging.
2. **Right to Erasure (GDPR/CCPA)**: Automated endpoints must be provided for users to view and permanently purge conversation records.
3. **Data Retention Limits**: Automated TTL-based deletion policies must enforce strict maximum data retention windows.
4. **Independent Vendor Review**: Any third-party model provider must undergo formal vendor privacy assessment and data processing agreement (DPA) execution.

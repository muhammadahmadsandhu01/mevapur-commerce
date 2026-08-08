# P5A Deployment Artifact Inventory

## Scope and result

This is a repository-only inventory. It does not select a platform and it did not access real environment files, private configuration, Atlas, deployed endpoints, or provider services.

**Result:** the repository contains runnable package scripts and Next.js build configuration, but no authoritative first-party hosting, container, CI/CD, reverse-proxy, or process-manager definition. A platform and packaging mode remain owner decisions.

## Inventory

| Item | Classification | Evidence | Deployment consequence |
|---|---|---|---|
| Root application manifest | Absent | No root `package.json` | Backend, storefront, and admin must be installed and operated as three separate Node applications. |
| Backend package manifest | Present and active | `backend/package.json`; `start` is `node server.js` | Provides the only repository-supported backend start command. |
| Storefront package manifest | Present and active | `frontend/package.json`; `build` is `next build`; `start` is `next start` | Requires install and build before start. |
| Admin package manifest | Present and active | `admin-panel/package.json`; `build` is `next build`; `start` is `next start` | Requires install and build before start. |
| npm lock files | Present and active | Lockfile v3 in `backend`, `frontend`, and `admin-panel` | `npm ci` is the deterministic install method supported by the committed locks. |
| Project Node version pin | Absent | No `engines`, `.nvmrc`, `.node-version`, or `.tool-versions` | Platform runtime version must be selected and then pinned in a separately approved source-change milestone. |
| First-party Dockerfile | Absent | First-party scan excluding generated/third-party folders | No container build contract exists. |
| Docker Compose | Absent | First-party scan | No local or hosted multi-service container topology exists. |
| Third-party Docker artifacts | Present but inactive/legacy | Docker-related files occur only inside excluded dependency/vendor trees | They belong to dependencies and are not application deployment evidence. |
| Procfile | Absent | First-party scan | No Heroku-style process declaration exists. |
| Vercel configuration | Absent | No `vercel.json`; `.vercel` is only an ignored name | The ignore entry is a framework-template convention, not proof of an active Vercel deployment. |
| Render configuration | Absent | No first-party Render manifest | No Render service contract exists. |
| Railway configuration | Absent | No first-party Railway manifest | No Railway service contract exists. |
| Fly.io configuration | Absent | No `fly.toml` | No Fly application contract exists. |
| Netlify configuration | Absent | No `netlify.toml` | No Netlify application contract exists. |
| OpenAI Sites hosting configuration | Absent | No `.openai/hosting.json` | No Sites project is connected to this repository. |
| GitHub Actions | Absent | No `.github/workflows` directory | Build, test, deploy, and rollback automation are not defined in-repository. |
| Process manager | Absent | No PM2 ecosystem or equivalent first-party file | Process restarts and graceful termination are platform responsibilities until configured. |
| Reverse proxy | Absent | No first-party Nginx, Caddy, or equivalent configuration | Proxy count, forwarded headers, TLS termination, and request limits are unresolved platform inputs. |
| Serverless/edge configuration | Absent | No first-party serverless, worker, or function manifest | The backend is currently a long-running Express process, not a defined serverless artifact. |
| Storefront Next configuration | Present and active, with ambiguity | `frontend/next.config.ts` sets `output: 'standalone'`; `frontend/next.config.js` also exists with different image settings | P4 builds used the TypeScript configuration, but the duplicate JavaScript configuration is deployment debt and must not be guessed away in P5A. |
| Admin Next configuration | Present and active | `admin-panel/next.config.ts` sets `output: 'standalone'` | A standalone build can be produced, but the package start command remains `next start`; artifact-start strategy needs approval and validation. |
| Storefront image optimization | Present and active | `frontend/next.config.ts` enables optimization and remote patterns | Runtime may need outbound access to permitted remote image origins and writable cache space. One historic platform-looking image hostname is hardcoded; it is not authoritative hosting evidence. |
| Admin image optimization | Present and active | `admin-panel/next.config.ts` sets `images.unoptimized: true` | No Next image optimizer dependency is expected for admin images. |
| Environment example | Present but inactive/legacy | `backend/.env.example` is a Laravel-oriented example rather than the active Node runtime contract | It must not be used as the P5 injection contract. The P4 matrix and P5A injection plan are authoritative for variable names. |
| Storefront/admin environment examples | Absent | No tracked component-specific example found | Platform mapping must follow the P5A injection plan. |
| Real environment files | Present but intentionally uninspected | Ignored component environment filenames exist | They were not read, copied to the authoritative backup, modified, or treated as deployment evidence. |
| Backend health check | Present but liveness-only | `backend/app.js`, `GET /api/health` | It always returns HTTP 200 and reports database state coarsely; it does not prove database readiness or staging identity. |
| Storefront health check | Absent | No first-party route handler dedicated to health/readiness | A platform can probe `/` only as shallow liveness unless a later source milestone adds a dedicated route. |
| Admin health check | Absent | No first-party route handler dedicated to health/readiness | A platform can probe `/` only as shallow liveness unless a later source milestone adds a dedicated route. |
| Backend database fail-fast readiness | Absent/ambiguous | `backend/config/db.js` schedules reconnect after connection failure; `backend/server.js` can proceed to listen | A running process does not necessarily mean the database identity is usable. P5 requires a separate operator identity gate and a source-remediation decision. |
| Backend static uploads route | Present but ambiguous | `backend/app.js` exposes `/uploads`; no active first-party upload writer or `backend/uploads` directory was found | Do not assume durable uploads. If activated later, choose object storage or a persistent volume in a separate milestone. |
| Backend local file logs | Present and active | `backend/middleware/logger.js` and `backend/utils/logger.js` create/write log files | Backend currently requires a writable filesystem. Ephemeral storage, stdout aggregation, retention, and redaction need an explicit deployment decision/source remediation. |
| Storefront static assets | Present and active | `frontend/public`: 6 files, 147,031 bytes | Must be included in the build/deployment artifact. |
| Admin static assets | Present and active | `admin-panel/public`: 5 files, 3,314 bytes | Must be included in the build/deployment artifact. |
| Storefront font fetch | Present and active | `frontend/src/app/layout.tsx` uses `next/font/google` | Build requires font retrieval unless the asset is already cached; this is build-time network only, not an application API dependency. |
| Scheduled/background jobs | Absent | No first-party worker, queue consumer, scheduler, or cron entry point found | No worker service is required by current repository evidence. |
| WebSocket/SSE server | Absent | No first-party WebSocket or server-sent-event implementation found | No persistent realtime ingress is required. |
| Redis service | Absent from active deployment contract | No active process/configuration requiring Redis was found | Do not provision Redis in P5. Existing rate limits are process-local and are not coordinated across replicas. |
| Mobile deployment artifact | Absent/out of scope | `mobile` has no first-party deployment contents | P5A covers backend, storefront, and admin only. |

## Build output requirements

- Backend has no build step. The runtime needs `backend` source plus production dependencies.
- Storefront and admin require a successful `next build` and their public assets.
- Both Next configurations request `standalone` output, but the repository-supported start commands are still `npm run start` → `next start`.
- P5 must choose either package-script deployment or a separately validated standalone artifact layout. No standalone launch command is invented here.
- Generated `.next` output is not source evidence and must be rebuilt for the selected edition and approved public variables.

## Persistent-state assessment

- Authentication/session state is stored in MongoDB, not the Node process.
- Rate-limit state is process-local, so replicas do not share counters.
- Backend log files are process-local and currently make the backend operationally stateful.
- `/uploads` implies a filesystem surface but no active upload write flow was verified.
- Storefront/admin are otherwise horizontally replaceable when build artifacts and environment values are identical.

## Artifact blockers before P5 execution

1. Owner must select hosting platforms and topology.
2. Owner must select and pin a supported Node runtime.
3. Owner must choose package-script versus validated standalone Next artifacts.
4. Backend readiness/fail-fast behavior must be addressed or explicitly gated before traffic.
5. Backend filesystem logging, retention, aggregation, and redaction require an approved operational/source plan.
6. Duplicate storefront Next configuration must be resolved in a separate source-change milestone.
7. Dedicated storefront/admin health endpoints are absent.
8. Proxy hop count, TLS termination, and exact public origins cannot be decided from repository evidence.


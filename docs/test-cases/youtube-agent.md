# AI agent (YouTube Agent) — test cases

Service: `youtube-agent` · stored as a `userservices` row, `type: agent`
Automated by: `test/e2e/agent-e2e.cjs` (see `test/e2e/README.md`)
Last full run: **2026-11-17 — 32 / 32 passed** (fresh database; the Python
pipeline service is not running, so a run only checks what NestJS records and sends)

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 1.1 | Listed | Sidebar → Browse Services | "Youtube Agent" card with "Start free trial" | UI |
| 1.2 | Subscribe | Start free trial → Set Up Service → niche "Healthy home cooking" → Start Free Trial | Lands on My Services | UI |
| 1.3 | Stored as userservice | — | `type: agent`, `serviceId` = youtube-agent | DB |
| 1.4 | Trial + plan | — | `status: trial`, trial ends in 30 days, `plan.tier: basic`, `plan.monthlyFee` from the catalog | DB |
| 1.5 | Config | — | `config.pipelineType: youtube`, `config.niche`, `config.paused: false`, schedule set | DB |
| 1.6 | No old collection | — | nothing written to `usermodules` | DB |
| 1.7 | Email | — | trial-started email sent | Email log |
| 1.8 | No duplicates | Subscribe again | **400** | API |
| 1.9 | Chatbots not here | Subscribe a chatbot via `/userservices/subscribe` | **400** | API |
| 2.1 | One list | My Services | Agent and chatbot shown together | UI |
| 2.2 | Agents API | `GET /userservices/my` | Agents/automations only, with service name | API |
| 2.3 | Pause | Card → Pause | `config.paused: true`, status stays `trial`, card shows "paused" | UI + DB |
| 2.4 | Resume | Card → Resume | `config.paused: false` | UI + DB |
| 3.1 | Schedule | `PATCH /:id/schedule` daily 10:30 | `config.schedule` saved | API + DB |
| 3.2 | Bad schedule | frequency "hourly" | **400** | API |
| 3.3 | Prompt | `PATCH /:id/prompt` | `config.customPrompt`, `useCustomPrompt` saved | API + DB |
| 3.4 | Other accounts | Another user edits it | **404**, unchanged | API |
| 4.1 | Run | `POST /:id/run` | 201 with `runId`; pipeline run record has `agentId` = this service; `totalRuns` 1 | API + DB |
| 4.2 | Run status | `GET /:id/run-status` | This service's own latest run | API |
| 4.3 | Cost report auth | `PATCH /:id/record-run` without the pipeline secret | **401/403** | API |
| 4.4 | Cost report | With the secret, on `/userservices` and the old `/usermodules` alias | `config.totalCost` adds up | API + DB |
| 4.5 | Unpaid | Status `past_due` → run | **400** "trial has ended"; shown as "expired" | API |
| 5.1 | Admin list | Admin `GET /userservices` | Every customer's agents | API |
| 5.2 | Extend trial | Admin `PATCH /:id/extend-trial` | Back to `trial` | API + DB |
| 5.3 | Not for customers | Customer extends own trial | **403** | API |
| 5.4 | Usage | Admin `GET /admin/usage` | Counts the agent | API |
| 6.1 | Remove | Card → Remove → confirm | `isDeleted`, `status: cancelled`, `cancelledAt`; gone from My Services | UI + DB |
| 6.2 | No browser errors | Whole run | none | UI |

Not covered: the Python pipeline itself (video generation, YouTube upload) —
needs real keys and the Python service.

# Test cases — one file per service

Each service gets a file here listing every test case with its **input**
and **expected output**, grouped by pricing tier. The automated version of
each file lives in `test/e2e/<service>-e2e.cjs` (how to run it:
`test/e2e/README.md`).

| Service | File | Automated | Last full run |
|---|---|---|---|
| Restaurant chatbot | [restaurant-chatbot.md](restaurant-chatbot.md) | `test/e2e/restaurant-e2e.cjs` | 2026-11-16 — 63/63 |
| Gym chatbot | [gym-chatbot.md](gym-chatbot.md) | `test/e2e/gym-e2e.cjs` | 2026-11-16 — 64/64 |
| Gym chatbot | _next_ | — | — |

## Template for a new service

```markdown
# <Service> — test cases

Service: `<slug>` · Tiers: …
Automated by: `test/e2e/<service>-e2e.cjs`
Last full run: <date> — <passed>/<total>

## <Tier>: <area>
| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 1.1 | … | what the user/guest/admin/Meta does | what must happen | UI / API / Webhook / DB |

## Not covered by the automated run (check by hand)
- …
```

Rules:
- Every feature listed on the service's pricing card needs at least one case.
- Every "locked on this tier" feature needs a UI case **and** an API case
  (the UI hiding it is not enough).
- Update "Last full run" every time the suite is run in full.

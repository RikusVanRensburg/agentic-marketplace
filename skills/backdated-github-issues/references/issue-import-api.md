# Issue Import API (golden-comet)

The only GitHub endpoint that sets an issue's `created_at` to the past. `backdated-github-issues`
rests entirely on it; `scripts/gh-import.sh` wraps the call + poll.

## Why not the normal create

`POST /repos/{owner}/{repo}/issues` — and therefore `gh issue create`, which `to-issues` uses —
**always stamps `created_at` = now**. It cannot backdate. There is no flag for it. The Import API
is a separate, older, **undocumented preview** ("golden-comet") that predates and outlived the
deprecated Source Import API (`/import`, shut down April 2024 — not this one).

## The contract

```
POST /repos/{owner}/{repo}/import/issues
Accept: application/vnd.github.golden-comet-preview+json
```

Payload — `created_at` / `updated_at` / `closed_at` are **ISO-8601 UTC**, and are the whole point:

```json
{
  "issue": {
    "title": "...",
    "body": "<full doc content + marker + migration footer>",
    "created_at": "2024-03-12T10:04:00Z",
    "updated_at": "2024-03-12T10:04:00Z",
    "closed_at":  "2024-03-12T10:04:00Z",
    "closed": true,
    "labels": ["scope: rr", "state: needs-triage"]
  }
}
```

- `closed: true` + `closed_at` creates the issue **already closed** — archival, and it fires **no
  webhooks or notifications**.
- Response is **202 Accepted**, body carrying a status `url` (`.../import/issues/<import_id>`).
  The import is **asynchronous**.
- **Poll** `GET <status_url>` (same Accept header) until `status` is `imported` (success — body
  gains `issue_url`, whose trailing segment is the new issue number) or `failed` (surface
  `errors[]`). `pending` means keep waiting; back off between polls.
- Be gentle on rate: import **serially**, and back off on `403` / `429` / `502`.

## Verified behaviour (probed on this repo during the build)

- The imported issue's `created_at` / `closed_at` reflect the **backdated** values exactly, and
  `state` is `closed`.
- A sub-issue **attaches to an already-closed parent** — so parents can be imported closed and
  still gain children.

## Gotchas

- The status response's own top-level `created_at`/`updated_at` are the **import job's** times
  (now), not the issue's. Read the *issue's* date from `GET /issues/<n>`, never from the job.
- The endpoint is an undocumented preview. If it returns non-2xx, `failed`, or 404s, that is a
  **hard error** — surface it and stop. Do **not** fall back to `gh issue create`; a non-backdated
  issue silently defeats the skill's whole purpose.
- `gh`'s built-in `--jq` reads JSON without a standalone `jq` binary; `gh-import.sh` avoids even
  that, parsing the two flat fields it needs with `grep`/`sed` so it has no `jq`/`python` dependency.

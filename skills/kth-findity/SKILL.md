---
name: kth-findity
description: Manage KTH travel-expense reports and reimbursements in Findity / Hogia Expense (https://hogia.findity.com/app/) via the `kth findity` CLI. Use when the user wants to check pending expenses or notifications, list their travel reports, look up an individual report, view their Findity profile, or asks about "Findity", "Hogia Expense", "reseräkning", "travel expense", "utlägg", or pastes a hogia.findity.com URL. Pure-curl architecture — Findity exposes a REST JSON API behind OIDC bearer auth; the bearer is captured once via the warm browser and reused for every read. Prerequisite: load the main `kth` skill first to confirm SSO.
compatibility: Requires `kth` CLI + a warm KTH SSO session (`kth status` exits 0). Auth federates through KTH AD FS (login.ug.kth.se, OIDC client_id e4569b19-…) into Findity's own bearer-token API.
metadata:
  service: findity
  vendor: Findity / Hogia
  start_url: https://hogia.findity.com/app/
  login_url: https://hogia.findity.com/login/#/
  api_base: https://hogia.findity.com/api/v1/expense
---

# KTH Findity (travel expense) — service skill

KTH outsources travel-expense management to Hogia / Findity. The web
app is a Flutter SPA; underneath it is a clean REST API at
`https://hogia.findity.com/api/v1/expense/...` secured by an opaque
OIDC bearer token (~128 chars, not a JWT).

## Architecture

| Phase | How |
| ----- | --- |
| First login (one-time) | `kth findity login` drives the email-then-SAML flow. Findity prompts for an email, federates to KTH AD FS, completes silently (warm KTH SSO), and lands in the dashboard. We HAR-capture the Authorization header from one of Flutter's `/api/v1/expense/*` requests and store the bearer at `~/.config/browser-profile/.findity-bearer.txt` (mode 0600). |
| Read operations | `kth findity me / counters / reports / expenses / organizations / raw` all run pure curl with the saved bearer. No browser at runtime. |
| Bearer refresh | When curl returns 401, the wrapper re-navigates to `/app/` in the warm browser. KTH SSO completes silently; Flutter requests a new token; we re-capture from a new HAR. |

After the first login, Findity remembers your email/identity — every
subsequent refresh is silent as long as KTH MSISAuth is still valid
(~12h, or ~7d if "Keep me signed in" was ticked at `kth login`).

## Prerequisites

1. KTH SSO must be alive: `kth status` exits 0.
2. The first time this skill is used in a profile, the user runs:
   ```bash
   kth findity login
   ```
   The email is derived from `KTH_USER_EMAIL` (or `${KTH_USER_ID}@kth.se`
   if not set) in `~/.config/kth-cli/config.env`.

## Verbs

### "How many pending expenses do I have?"
```bash
kth findity counters
```
Prints, per organisation: `notifications`, `transactions`, `inbox`,
`approvals`, `rejections`, `expenses`. Cron-friendly. Returns 0 across
the board when there's nothing waiting.

### "Show my profile"
```bash
kth findity me
```
Returns the full JSON: id, email, name, defaultCurrency, language,
address, settings. Useful for confirming which Findity account the
bearer authenticates as.

### "List my expense reports"
```bash
kth findity reports          # default max=20
kth findity reports --max 50
```
Prints `[reportId] title  status=...  amount`.
Backed by `GET /api/v1/expense/expensereports?organizationId=...`.

### "List my individual expenses (line items)"
```bash
kth findity expenses --max 10
```
Returns the raw JSON from
`GET /api/v1/expense/expenses?organizationId=...`. Includes card
transactions, splits, and the meta capabilities so an agent can
inspect what's modifiable.

### "Which organisations do I belong to?"
```bash
kth findity organizations
```
Almost always returns just one entry (KUNGLIGA TEKNISKA HÖGSKOLAN).
The `id` is what the other endpoints want as `organizationId`.

### "Run an undocumented endpoint"
```bash
kth findity raw '/api/v1/expense/me/organizations/<orgId>/cards?max=50'
kth findity raw '/api/v1/expense/me/organizations/<orgId>/expensetypes'
```
Passthrough for endpoints the wrapper doesn't have a verb for yet.

### "Have I already filed a receipt for this month/vendor?"
```bash
kth findity history             # diagnostic: total reports + expenses across all statuses
kth findity grep openai         # search past expenses for matching vendor/description
kth findity grep "chatgpt"
```
`history` is the safer pre-flight check before adding a new receipt —
it queries every status filter the API accepts and prints totals plus
an interpretation.

The Findity API only exposes two valid `processStatus` values on
`/expensereports`: **DRAFT** and **REJECTED**. The unfiltered endpoint
returns whatever the SPA's "current view" shows. Submitted/attested
reports appear in the SPA's UI but the corresponding REST sub-route
doesn't exist (confirmed via 404 probing of `/archived`, `/sent`,
`/history`, `/closed`, `/financereports`, etc.). If `kth findity
history` shows total=0 across the board but the SPA shows past reports,
the SPA is rendering them from a UI-only filter on the same endpoint —
in which case the `expenses` line-items endpoint is the cleanest way
to enumerate everything.

### "Inspect / debug auth"
```bash
kth findity bearer            # print the cached bearer (for ad-hoc curl)
kth findity refresh           # force-recapture the bearer via the browser
```

## Discovered API surface

| Endpoint                                              | Used by                       |
| ----------------------------------------------------- | ----------------------------- |
| `GET /api/v1/expense/me`                              | `kth findity me`              |
| `GET /api/v1/expense/me/organizations`                | `kth findity organizations`   |
| `GET /api/v1/expense/me/counters`                     | `kth findity counters`        |
| `GET /api/v1/expense/expensereports?organizationId=…` | `kth findity reports`, `history` |
| `GET /api/v1/expense/expensereports?…&processStatus=DRAFT\|REJECTED` | `kth findity history` |
| `GET /api/v1/expense/expenses?organizationId=…`       | `kth findity expenses`, `grep` |
| `GET /api/v1/expense/me/organizations/{orgId}/expensetypes` | not yet wrapped         |
| `GET /api/v1/expense/me/organizations/{orgId}/cards`        | not yet wrapped         |
| `POST /api/oauth/token`                               | (Flutter only; bearer source) |
| `POST /api/auth/externalloginurls`                    | (login-discovery; not wrapped) |

All non-auth endpoints require `Authorization: Bearer <token>`. The
`organizationId` query parameter is mandatory for any list that scopes
by org.

## Upload + post-upload workflow (verified 2026-05-26)

KTH-Expense (Findity Flutter SPA) accepts receipt PDFs via the
**Browse files** button on the home view. After upload, Findity OCRs
the PDF and creates a DRAFT expense with: date, amount, currency,
description (vendor-recognised), and the user's pre-saved custom
fields (project, unit, code).

### What's automatable via API (works)

| Operation | Endpoint | Notes |
| --------- | -------- | ----- |
| Update an expense's description | `PUT /api/v1/expense/expenses/{id}` | Body **must** include `id` matching URL + `verification.type: "ReceiptVerification"`. |
| Attach expense to a report | Same PUT, set `expenseReportId` | No separate add-to-report endpoint. |
| List **unattached** draft expenses | `GET /api/v1/expense/expenses?organizationId=…&include=verification` | Expenses already in a report DON'T appear here — clean signal for the processor loop. |
| Get one expense w/ full detail | `GET /api/v1/expense/expenses/{id}?include=verification` | Returns OCR'd metadata + receiptAttachment object. |
| Read the report contents | `GET /api/v1/expense/expensereports?organizationId=…&include=expenseRecords` | The attached expenses come back nested. |

### Full programmatic upload (verified 2026-05-26)

The upload is a **3-step API sequence** — no Flutter SPA interaction needed:

```
Step 1: POST /api/v1/expense/content?organizationId={org}
        Content-Type: application/pdf
        Authorization: Bearer {token}
        Body: raw PDF bytes
        → 201  {"id":"<contentId>", "isTemporary":true, ...}

Step 2: PUT /api/v1/expense/content/{contentId}?action=scan&organizationId={org}
        Authorization: Bearer {token}
        → 200  {"scanResult":{"amount":248.75,"currency":"SEK","purchaseDate":"2024-08-25","categoryIds":[...],...}}

Step 3: POST /api/v1/expense/expenses
        Content-Type: application/json
        Authorization: Bearer {token}
        Body: {"organizationId":"…","expenseReportId":"…","categoryId":"…",
               "verification":{"type":"ReceiptVerification","amount":…,"taxAmount":…,
               "currency":"…","description":"…","purchaseDate":"…T12:00:00Z",
               "receiptAttachment":{"id":"<contentId>"},
               "customFields":[...]}, "reimbursementCurrency":"SEK"}
        → 201  expense created as DRAFT, attached to report
```

**Rate limiting**: Findity throttles after ~15-20 rapid requests. Use a
3s delay between receipts to avoid "Failed to fetch" bursts.

**Bearer capture**: the bearer is NOT in cookies; it's an in-memory OIDC
token the SPA passes via `Authorization` header. Capture it by
intercepting `window.fetch` or `XMLHttpRequest.setRequestHeader` in the
page context (via Claude Chrome extension JS), or by enabling CDP
`Network.enable` and watching for `/api/v1/expense/*` requests.

### CLI: `kth-findity-upload`

Uploads receipts from a manifest (local JSON or hypha URL) to Findity
via the 3-step API sequence above.

```bash
kth-findity-upload --manifest <url-or-path> \
  --bearer <token> \
  --report-id <id> \
  [--delay 3] [--dry-run]
```

Or via the Claude Chrome extension (JS in-page, bearer auto-captured):
```javascript
// In the Findity SPA's page context:
// 1. Intercept fetch to capture bearer
// 2. Fetch manifest from hypha URL
// 3. Loop: fetch PDF → POST content → PUT scan → POST expense
// See bin/kth-findity-upload for the full script.
```

### What does NOT work for upload (don't re-try)

CDP-based approaches for driving Flutter's file picker all fail because
Flutter checks `event.isTrusted` on DOM events:
- `DOM.setFileInputFiles` — files set but Flutter's `change` listener ignores
- `Page.handleFileChooser` — chooser intercepted but no upload fires
- Synthetic JS `DragEvent` on `flutter-view` — dispatched but ignored
- `Input.dispatchDragEvent` (CDP-native) — protocol ok but no effect
- `flutter_dropzone_web.onDropFile(event, file)` — Dart closure invoked
  but doesn't trigger the upload pipeline

The working path is the **direct API** (3 steps above) or **user manually
clicks Browse files** (the only way to get trusted DOM events).

### `bin/kth-findity-process` script

Polls Findity for unattached DRAFT expenses, matches each against the
local submission manifest (`~/.cache/kth-receipts/staged-submission-*/files.json`)
by `date + amount`, and PUTs:
- `verification.description` ← vendor-specific template (Matomo, OpenAI,
  Anthropic, Slack, Cloudflare, GoogleCloud, Gandi). Stays general per
  user preference: "X service ({Month YYYY}) — used for AICell Lab AI
  agent research at KTH."
- `expenseReportId` ← target report (default: "Web, Compute & AI Services").

Run:
```bash
kth-findity-process              # one-shot, exit after pass
kth-findity-process --watch      # poll every 5s forever
kth-findity-process --dry-run    # show what would change without doing it
```

### KTH-Expense custom-field IDs (example values)

> **Note:** The field-definition IDs below are org-wide (shared by all
> users in the same Findity organisation), but the **values** are
> specific to the original author's KTH unit and project. You must
> discover your own values via `kth findity raw
> '/api/v1/expense/me/organizations/{orgId}/expensetypes'` or by
> inspecting an expense you created manually in the Findity SPA.

| Field | Field-definition ID | Example value |
| ----- | ------------------- | ------------- |
| Project number (projektnr) | `3b51138dcfa54fe590767611513081cc` | 89256 (example: KAW DDLS Fellows) |
| Sub-project / activity | `3c7f808b155142d08a75bb6fcb995ed5` | (empty default) |
| Unit / dept code | `4ba9eade2e884fff95988938dffd6839` | SKE (example: Biofysik) |
| Cost type? | `9d429eb0c1b6428aa9724b96f657e664` | (empty default) |
| Account code | `a37dc604fcf34714872f220cbf38258f` | 662 (example: Licensavgifter) |
| Other | `f4a055d884204fb08912d97d625367ba` | (empty default) |

Custom fields auto-fill from the user's profile defaults on every new
upload — the `kth-findity-process` script does NOT need to set them.

### Category IDs

| Category | ID |
| -------- | -- |
| Licensavgifter / Licence fees | `3399ebe6bed14e4491a901e3c6f77cf7` |

(Full org category list at `GET /api/v1/expense/me/organizations/{orgId}/expensetypes`
— but the org seems to expose only ~3 categories total; Licensavgifter
covers all SaaS subscriptions in the curated submission.)

## Known limits / future work

- **Write actions are not implemented**. No `kth findity submit`,
  `kth findity create-report`, `kth findity add-receipt`. These would
  POST to `/api/v1/expense/expensereports` and
  `/api/v1/expense/expenses` — the endpoints are visible in network
  traces when you create one by hand. Capture them via HAR before
  wrapping. Per the irreversible-writes-stay-in-browser principle,
  **submit-for-approval** should always stay manual.
- **Bearer extraction depends on HAR capture**. The Flutter app
  doesn't expose its token in plain localStorage; we sniff it from
  the request's Authorization header. If Findity changes the request
  shape, the regex in `capture_bearer()` needs to track it.
- **Email auto-derivation may be wrong**. If `KTH_USER_EMAIL` is not
  set, the wrapper falls back to `${KTH_USER_ID}@kth.se`. For users
  whose Findity account uses `firstname.lastname@kth.se` rather than
  the short KTH-ID form, set `KTH_USER_EMAIL` explicitly.

## What this skill should never do

- **Submit / approve / send for reimbursement** without explicit user
  confirmation. Travel reimbursements go to KTH's payroll — once
  submitted, reversing the decision is a manual conversation with
  Findity / Hogia support.
- **Cache or commit** `~/.config/browser-profile/.findity-bearer.txt`.
  It's a live credential.
- **Print the bearer to terminal in shared sessions**. `kth findity
  bearer` exists for ad-hoc curl, not for casual sharing.

## Quick recipes

### "Anything for me to deal with today?"
```bash
kth findity counters
```
If everything's 0, there's nothing to do.

### "Show me my most recent report"
```bash
kth findity reports --max 1
```

### "What's the total amount across my open reports?"
```bash
kth findity reports --max 100 \
  | grep -oE 'amt=[0-9.,]+' | awk -F= '{s+=$2} END {print s}'
```
(Approximate — Findity returns amounts in multiple formats; for an
accurate total use `kth findity raw '/api/v1/expense/expensereports?organizationId=...'`
and process the JSON.)

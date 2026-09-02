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
  Anthropic, Slack, Cloudflare, GoogleCloud, Gandi). Keep it short and generic,
  e.g. `"<Vendor> <service> ({Month YYYY}) — <purpose> at KTH"` (mind the
  description length cap, below).
- `expenseReportId` ← the user's target report (resolve it fresh by name — see
  the report-id lesson below).

Run:
```bash
kth-findity-process              # one-shot, exit after pass
kth-findity-process --watch      # poll every 5s forever
kth-findity-process --dry-run    # show what would change without doing it
```

### KTH-Expense custom-field IDs (example values)

> **Note:** The field-definition IDs below are org-wide (shared by all users in
> the same Findity organisation); the **values** are per-user (your project,
> unit and account codes) and are NOT included here. Discover your own values
> for a given expense by reading an existing expense you created in the SPA:
> `GET /api/v1/expense/expenses?organizationId={orgId}&include=verification`
> and copy its `verification.customFields` array verbatim onto new expenses.

| Field | Field-definition ID | Value |
| ----- | ------------------- | ----- |
| Project number (projektnr) | `3b51138dcfa54fe590767611513081cc` | `<your project no.>` |
| Sub-project / activity | `3c7f808b155142d08a75bb6fcb995ed5` | (often empty) |
| Unit / dept code | `4ba9eade2e884fff95988938dffd6839` | `<your unit code>` |
| Cost type | `9d429eb0c1b6428aa9724b96f657e664` | (often empty) |
| Account code (konto) | `a37dc604fcf34714872f220cbf38258f` | `<your account code>` |
| Other | `f4a055d884204fb08912d97d625367ba` | (often empty) |

> **Correction (2026-09):** custom fields are **NOT** auto-filled on the
> API `POST /expenses` path — a POST without `verification.customFields`
> is rejected 400 `REQUIRED_FIELD`. Copy the exact `customFields` array
> from an existing expense in the target report. (The SPA fills them for
> you; the API does not.) The account code (`a37dc604…`) is a **constant
> KTH code, independent of the category** — the same value is used across
> Licensavgifter, Verksamhetsmaterial, Kurs & konferens, etc.

### Category IDs

The full org category list (48 categories, not ~3) is at:
```
GET /api/v1/expense/me/organizations/{orgId}/expensetypes/ReceiptVerification/categories?max=100
```
Each entry has `id` + `name` (Swedish/English) but **no account code**.
The OCR scan step (`PUT content/{id}?action=scan`) returns suggested
`categoryIds` — its top suggestion is usually correct. Key ones:

| Category | ID | Use for |
| -------- | -- | ------- |
| Licensavgifter / Licence fees | `3399ebe6bed14e4491a901e3c6f77cf7` | SaaS subscriptions, domains |
| Verksamhetsmaterial / Consumable durable goods | `7c076ac1fd964b25a305b8bac545fc20` | hardware / devices |
| Kurs- & konferens / Course & conference | `1697791c5bb244b7ae318d2741668697` | courses, conferences |

## Reports: create, split, submit (discovered 2026-09)

The full write surface for reports is known — use it **only with the
user's explicit, per-action consent in the same session** (see the
irreversible-writes principle; `?action=send` is the money-moving submit).

| Operation | Call |
| --------- | ---- |
| Create report | `POST /expensereports` `{organizationId,name,comment,reimbursementCurrency:"SEK",type:"MANUAL",customFields:[…]}` |
| Rename / edit report | `PUT /expensereports/{id}` (same shape). Comment goes in the **top-level `comment`** — a comment *customField* 400s "failed to handle request". |
| Delete report | `DELETE /expensereports/{id}?organizationId=` → 204 |
| Move an expense between reports | `PUT /expenses/{id}` with full body + changed `expenseReportId` |
| **Submit ("send in")** | `PUT /expensereports/{id}?action=send&organizationId=…` with **NO body** (a body → 400). DRAFT → **PROCESSING** on success. |
| Download a stored receipt | `GET https://hogia.findity.com/api/resources/{receiptAttachment.id}` → the PDF |

**Report creation REQUIRES two report-level custom fields** (both BLOCKER
if missing): Syfte/Purpose (`9f2272662e9245b786f238a7fedded62`, one of Findity's
standard values e.g. "Forskning/Research") and unit/school
(`bfeede0fc8f0449f81801491b521cc70`, `<your unit/school code>`). Copy both
values from one of the user's existing reports rather than hard-coding them.

**Per-report record limit ≈ 15–22 (small!).** A report of 15 submits; 23 is
rejected with BLOCKER `MAXIMUM_NUMBER_OF_EXPENSE_RECORDS_EXCEEDED`. **Only the
actual submit enforces it** — the `?include=validationErrors` field on a GET
is stale after edits and cannot be trusted. Size reports to **≤15** and verify
by submitting. To split a large report: create new reports, move expenses via
`PUT expenseReportId`, then submit each.

**Duplicate guard:** creating/editing an expense with the same amount +
purchaseDate as an existing one → 400 `EXPENSE_ALREADY_EXIST_SIMILAR_CONTENT`
(a WARNING with **no API override**; changing the description does not help).
Genuinely distinct same-day/same-amount charges must be added via the SPA's
"save anyway"; once both exist neither can be PUT-edited via the API — keep
them in one report and leave them untouched.

**Bearer capture (simplest):** read it in-page from
`JSON.parse(sessionStorage.getItem('auth')).accessToken` (128-char opaque,
~1h). Re-read to refresh when a call returns 401.

### Why a report was returned (rejection reasons)

When an admin returns a report, `processStatus` becomes **REJECTED** and the
report becomes editable again (`canBeSentIn: true`). The admin's message is
**not** on the report object and there is **no** `/comments` endpoint — it
arrives as a **notification**:
```
GET /api/v1/expense/me/notifications?max=50
```
Each returned report yields an entry `{header:"Report returned by admin",
body:"Your report <NAME> has been returned by the report admin with message: <TEXT>"}`.
Parse `body` for the free-text reason. (The per-record `rejectComment` field
exists but is usually empty — the real feedback is the notification body.)
Admins often reference lines by **number** (1..N) in the report's display
order (date ascending) — number the records the same way to map the feedback.

To attach a better document to a line, upload it (`POST /content`) and `PUT
/expenses/{id}` with the new `receiptAttachment.id`; the verification also has
an `attachments` array for **additional** docs (e.g. invoice + payment
confirmation on the same expense). Then re-submit (`?action=send`) with the
user's fresh consent.

### What counts as a VALID receipt (KTH admin rules — attach the RIGHT doc up front)

A line is accepted only with a **formal invoice/receipt** that shows an
**invoice/receipt number + VAT number + "Bill to"** AND **proof of payment**
(the document says "paid on …" / "Amount paid", or a separate payment
confirmation is attached). Charge-notification emails, order-status emails, and
"your invoice is available" emails are **rejected**. Per vendor, the correct
document is:

| Vendor | ✅ Attach this | ❌ Rejected |
| ------ | ------------- | ---------- |
| **OpenAI API** | the formal receipt (has an `Invoice number`, OpenAI VAT id, Bill-to KTH) from platform.openai.com billing history | "Your OpenAI API account has been funded" email |
| **OpenAI ChatGPT Plus** | the €18.40 invoice/receipt | — |
| **Anthropic** | the **RECEIPT** (`_2` file — "Amount paid / paid on"), **not** the `_1` **Invoice** ("Amount due") | the `_1` invoice alone (admin: "does not show it is paid") |
| **Cloudflare** | the real **invoice** PDF **+** the **"purchase confirmed"** email ("successfully charged $X to your card") as payment proof — merge both into one PDF (`pdfunite invoice.pdf confirmed.pdf out.pdf`) | "your invoice is available" email alone |
| **Matomo (Paddle)** | Paddle's **full VAT invoice** (has Paddle IE VAT number) via the receipt's "Download/View invoice" or help@paddle.com | the plain "Your Matomo receipt" (VAT amount but no VAT number) |
| **Google Cloud (GCP)** | invoice **+** payment confirmation from console → Billing → Documents ("Payments received" page) | "invoice is available" notice alone |
| **Google Play (AI Plus/One)** | the Google Play **order receipt** email (accepted as-is) | — |
| **Slack** | the plan-renewal **receipt** (`_1`) | — |
| **Temu / physical goods** | the order receipt, claimed **net of any refund** (import-fee deposits are often refunded — claim the amount actually kept) | claiming the pre-refund order total |

Where the invoice does not itself show "paid", either attach the payment
confirmation as an **additional** doc (verification `attachments` array) or
**merge** invoice+confirmation into one PDF and set it as `receiptAttachment`
(the reliable path — `pdfunite a.pdf b.pdf out.pdf`; a screenshot works as
proof too — `sips -s format pdf shot.png --out shot.pdf` then merge). Matomo
VAT invoices and GCP payment confirmations are **not in email** — pull them
from the vendor self-service portal (Paddle receipt page → Download invoice;
GCP Billing console → Documents → "Payments received"). Tiny sub-cost lines
that would cost more to document than they're worth: delete them (DELETE the
expense) rather than chase proof.

### Gotchas learned (this account, the hard way)

- **Correction cycles are per-report and take rounds.** Fix a rejection, then
  **re-verify every line by actually downloading `/api/resources/{id}` and
  grepping the text** ("invoice number" / "amount paid" / "successfully
  charged") before re-submitting — the Findity UI's green "complete" tick does
  NOT mean the *right kind* of document is attached.
- **`description` has a hard length cap** (~a couple hundred chars) → a PUT with
  a long description fails 400 `DB_SCHEMA_VIOLATION "field has too many
  characters"`. Keep line descriptions short.
- **`INVALID_SEND_STATE "already being processed"`**: a report mid-send can't be
  re-sent; re-GET its `processStatus` before retrying a submit (it probably
  already went to PROCESSING). **But first suspect a wrong report id** — see next.
- **Never reuse a cached report id after any split/rename/move.** Splitting a
  report reshuffles which id holds what, so a hard-coded id can point at a
  different (already-PROCESSING) report and a submit then fails
  `INVALID_SEND_STATE`. Always **resolve the target report freshly by
  name + processStatus** (list `/expensereports?...&processStatus=REJECTED` and
  pick by `name`) right before you edit or submit it.
- **Token dies ~hourly and the browser bridge can vanish** (Navigator service is
  session-scoped; a new day = Findity SSO expired → the app sits on the login
  page and the user must re-login). Re-capture `sessionStorage.auth.accessToken`
  after any 401; if the tab is on `/login/#/`, ask the user to sign in.
- **Amounts:** claim **net of refunds** (Temu refunds the import-fee deposit) and
  attach the refund proof; watch for admin "wrong amount?" notes.

## Known limits / future work

- **Write actions are not yet wrapped in the CLI** (no `kth findity
  submit / create-report / add-receipt`), but the raw endpoints are all
  documented above under *Reports* and the upload flow — they can be
  driven directly with curl / `javascript_tool`. Submit-for-approval
  (`?action=send`) is a money-mover: run it **only with the user's fresh,
  per-action, in-session consent**, never unattended.
- **Bearer**: read in-page from `sessionStorage.auth.accessToken` (see
  *Reports* above) — no HAR/interceptor needed. Re-read on 401.
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

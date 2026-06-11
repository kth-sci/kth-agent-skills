---
name: kth-efh
description: Query KTH's Unit4 EFH (Elektronisk fakturahantering — e-invoice handling) for pending tasks via a pure-curl JSON API. Use when the user asks "do I have any invoices to approve", "how many pending tasks in EFH / Inwise / Unit4", mentions "ekonomisk attest", "fakturaattest", "Inwise tasks", or pastes a `https://agrprodweb01.ug.kth.se/agrprod/` URL. The skill uses `kth efh` CLI for pure-curl reads and the Chrome extension (claude-in-chrome MCP) for discovery + interactive write actions. Prerequisite: load the main `kth` skill first to confirm SSO.
compatibility: Requires the `kth efh` CLI and a populated cookie jar at $KTH_EFH_COOKIE_JAR. Browser interactions use the Chrome extension (claude-in-chrome MCP).
metadata:
  service: efh
  vendor: Unit4
  product: ERP / Agresso / Inwise
  start_url: https://agrprodweb01.ug.kth.se/agrprod/
  api_base: https://agrprodweb01.ug.kth.se/agrprod/api
---

# KTH EFH (e-invoice handling) — service skill

Unit4's ERP system at KTH (internally known as **Inwise** / **Agresso**)
runs at `https://agrprodweb01.ug.kth.se/agrprod/`. Its EFH module handles
electronic invoices that need a user to act on them — typically
"Ekonomisk attest" (financial approval) of incoming supplier invoices.

The Unit4 webapp federates via KTH SAML, so a warm KTH session lands in
the dashboard silently. From there we use the JSON APIs directly via curl
for all read operations, and the Chrome extension (claude-in-chrome MCP)
for discovery and interactive write actions.

## Two-layer architecture

```
                 Chrome extension                    kth efh CLI
              (claude-in-chrome MCP)                (pure curl)
             ┌──────────────────────┐          ┌─────────────────┐
             │  navigate, read_page │          │  tasks, count,  │
             │  javascript_tool,    │          │  session, url,  │
             │  find, computer      │  cookies │  invoice,       │
             │                      │ ───────> │  summary        │
             │  Discovery:          │  (jar)   │                 │
             │  - capture XHR       │          │  (fast, no UI)  │
             │  - export cookies    │          │                 │
             │                      │          └─────────────────┘
             │  Write actions:      │
             │  - Ekonomisk attest  │
             │  - user clicks final │
             └──────────────────────┘
```

- **Read verbs** (`tasks`, `count`, `session`, `url`, `invoice`, `summary`)
  are pure curl via the `kth efh` CLI. Fast, scriptable, cron-friendly.
- **Cookie capture** is done once via the Chrome extension, then persisted
  to a Netscape-format jar for curl to consume.
- **Discovery** (mapping an invoice to its document UUIDs + access IDs) is
  done via the Chrome extension's `javascript_tool` + `read_network_requests`.
- **Write actions** (Ekonomisk attest, Parkera, etc.) are driven interactively
  via the Chrome extension. The user clicks money-moving buttons.

## Prerequisites

1. The main `kth` skill must have confirmed KTH SSO is active (user is
   logged in to kth.se in the browser the Chrome extension is connected to).
2. The cookie jar at `$KTH_EFH_COOKIE_JAR` (default:
   `~/.config/kth-cli/.cookies-agrprod.txt`) must be populated.
   See "Capturing cookies via Chrome extension" below.

## Capturing cookies via Chrome extension

Before any `kth efh` CLI verb will work, you need to export the EFH
session cookies from the browser into a Netscape-format cookie jar.

### Step-by-step recipe

1. **Navigate** to the EFH home page:
   ```
   navigate: https://agrprodweb01.ug.kth.se/agrprod/
   ```
   (The KTH SSO bounce happens automatically if the user is logged in.)

2. **Wait** for the page to load (check with `read_page` or `get_page_text`
   to confirm we're on the EFH dashboard, not an SSO redirect).

3. **Export cookies** via `javascript_tool`:
   ```javascript
   // Read all cookies visible to JS on this origin
   const cookies = document.cookie.split('; ').map(c => {
     const [name, ...rest] = c.split('=');
     return 'agrprodweb01.ug.kth.se\tFALSE\t/agrprod\tTRUE\t0\t'
            + name + '\t' + rest.join('=');
   }).join('\n');
   '# Netscape HTTP Cookie File\n' + cookies;
   ```

4. **Write** the output to the cookie jar file:
   `~/.config/kth-cli/.cookies-agrprod.txt`

   Note: Some cookies (FedAuth, .ASPXAUTH) are HttpOnly and not visible
   to `document.cookie`. For those, use `read_network_requests` to
   intercept a live XHR and extract the `Cookie` header, then parse it
   into Netscape format. Alternatively, navigate to the EFH URL while
   `read_network_requests` is active and capture the full cookie string
   from the request headers.

5. **Verify** by running:
   ```bash
   kth efh session
   ```
   Should return `{"userId": "WEIO", "client": "UF", ...}`.

### Cookie lifetime

The Unit4 cookies (`.ASPXAUTH`, `FedAuth`, `ASP.NET_SessionId`) are
session-scoped in the browser. They remain valid as long as the browser
tab/session stays open. The SAML IdP cookie (`MSISAuth`, ~12h lifetime,
~7d with "Keep me signed in") governs whether a silent re-auth works.

If `kth efh` returns HTTP 4xx, re-export cookies via the Chrome extension.

## CLI verbs

### "Do I have any pending tasks?" / "How many invoices?"

```bash
kth efh count
```

Prints a single integer (sum of `count` across all task categories).
Cron-friendly. Returns 0 even when there are no tasks.

### "Show me my EFH task list"

```bash
kth efh tasks
```

Prints the full JSON array of task categories. Each entry corresponds
to one workflow queue the user owns. Important fields:

| Field         | Meaning                                                |
| ------------- | ------------------------------------------------------ |
| `client`      | Organizational unit (KTH = `UF`)                       |
| `description` | Human-readable step name, e.g. `"Ekonomisk attest"`    |
| `process`     | Process code, e.g. `"EFH"`                             |
| `elementType` | Document type, e.g. `"Faktura"`, `"Order"`             |
| `step`        | Workflow step                                          |
| `count`       | Number of pending items in this category               |
| `viewId`      | Unit4 screen identifier to open this list (`TFI004` …) |
| `queryString` | Pre-built query for the screen                         |

### "Who am I logged in as in Unit4?"

```bash
kth efh session
```

Returns `{"userId": "WEIO", "client": "UF", "language": "SE", ...}`.
Useful for sanity-checking that the right account is active.

### "Build a deep-link URL for a Unit4 view"

```bash
kth efh url <viewId> [queryString]
```

### "Download the invoice and all its attachments"

```bash
kth efh invoice <vernr>                  # by invoice (verification) number
kth efh invoice <vernr> --out ./inv-dir  # custom output directory
kth efh invoice                          # use most recently cached invoice
```

**Requires a cached discovery manifest** at
`~/.config/kth-cli/.efh-cache/<vernr>.json`. See "Invoice discovery
via Chrome extension" below for how to create one.

Once the cache exists, this verb pulls every document directly via curl
from `GET /api/documents/{client}/{docType}/{uuid}/1/1/1?_parentAccessId=…&_accessId=…`.
Each file is named by docType+UUID and gets the right extension based on
`Content-Type` (`.html` for the `EI02` invoice, `.pdf` for attachments).

Output: a `manifest.json` listing every downloaded file with HTTP status,
size, and content type — plus the files themselves.

### "Summarize the invoice and propose a project"

```bash
kth efh summary [vernr]
```

Parses the EI02 `Faktura.htm`, applies `project-accounts.yaml` rules,
and outputs structured JSON with: invoice details, line items, proposed
project, draft comment, and COI flags.

## Invoice discovery via Chrome extension

The EFH API requires a server-side "activity context" (set up by
clicking through the UI) before it will return document UUIDs and access
IDs for a specific invoice. This means discovery cannot be done via curl
alone — it needs a live browser session.

### Step-by-step discovery recipe

1. **Navigate** to the EFH dashboard:
   ```
   navigate: https://agrprodweb01.ug.kth.se/agrprod/
   ```

2. **Start monitoring network requests**:
   ```
   read_network_requests  (to capture XHR traffic)
   ```

3. **Click the task bell** (the "Att N" button in the toolbar) using
   `find` or `read_page` to locate it, then `computer` (click action)
   to click it.

4. **Click the first task row** in the dropdown panel.

5. **Wait** for the invoice detail to load (~5 seconds).

6. **Capture the XHR traffic** via `read_network_requests`. Look for:
   - `POST /api/documents/{client}/doctypesandkeys?ind={client};{vernr};{period}`
     — this response contains the document UUID list per docType.
   - Any `GET /api/documents/…` URL — extract `_accessId` and
     `_parentAccessId` from the query string.

7. **Build the cache manifest** — a JSON file at
   `~/.config/kth-cli/.efh-cache/<vernr>.json`:
   ```json
   {
     "vernr": "12345",
     "client": "UF",
     "period": "2026",
     "access_id": "CR398",
     "parent_access_id": "AP278",
     "discovered_at_unix": 1748275200,
     "documents": [
       {"docType": "EI02", "uuid": "abc-def-..."},
       {"docType": "OVRDOK", "uuid": "ghi-jkl-..."}
     ]
   }
   ```

8. **Download** via the CLI:
   ```bash
   kth efh invoice 12345
   ```

This two-phase design (Chrome extension for discovery, curl for download)
keeps the fast path pure-curl while using the browser only when the
server-side activity context demands it.

## Write actions via Chrome extension

Unit4's write endpoints are ASP.NET WebForms postbacks to
`/agrprod/ContentContainer.aspx` with a server-encrypted, server-signed
`__VIEWSTATE` blob. The `__VIEWSTATE` is rotated on every page load, so
curl replay is structurally impossible. All write actions must be done
in the live browser via the Chrome extension.

### Workflow for write actions

1. **Navigate** to EFH and open the target invoice (same as discovery
   steps 1-5 above).

2. **Use `read_page`** to screenshot the current state and identify
   the relevant buttons in the toolbar:
   - *Ekonomisk attest* — financial approval (money-moving)
   - *Parkera* — park the invoice with a comment
   - *Vidarebefordra* — forward to another user
   - *Felaktig faktura* — reject as incorrect
   - *Eskalera* — escalate to supervisor

3. **For money-moving actions** (Ekonomisk attest): the agent prepares
   the screen (verifies Proj column, amount, adds comments if needed)
   and then **stops**. The user must click the final button themselves.
   The agent NEVER auto-submits an approval.

4. **For reversible actions** (Parkera, add comment): the agent can
   fill forms via `javascript_tool` or `form_input`, but should still
   confirm with the user before clicking submit.

5. **For Sakattestera (factual attest):** EVERY Sakattestera item
   **requires a comment from the user** before it is approved. The agent
   must, for each invoice in the queue: (a) read the `Faktura.htm` and
   summarize what the invoice is for, (b) draft a proposed comment
   describing it, (c) **present that draft and wait for the user to
   confirm or edit the comment**, and only then (d) let the user click
   the Sakattestera button. Never approve a Sakattestera item without a
   user-supplied/confirmed comment. The final Sakattestera click stays
   with the user.

### Available write verbs (all via Chrome extension)

| Action | Effect | Final click |
| ------ | ------ | ----------- |
| Ekonomisk attest | Approve the invoice | **User** (money-moving) |
| Sakattestera | Factual approval (goods received) | **User**, and only after a user-confirmed comment per item |
| Parkera | Park with reason | Agent fills, user confirms |
| Kommentar | Add workflow comment | Agent fills, user confirms |
| Set Proj | Update project code | Agent fills, user confirms |
| Vidarebefordra | Forward to another user | User confirms |
| Felaktig faktura | Reject | User confirms |
| Eskalera | Escalate to supervisor | User confirms |

## API used (under the hood)

### Pure curl (no browser needed)

| Endpoint                                        | Purpose                                |
| ----------------------------------------------- | -------------------------------------- |
| `GET /agrprod/api/session/current`              | `{userId, client, language}`. Used to auto-detect the path params below. |
| `GET /agrprod/api/tasknotifications/{client}/{userId}?page=1&start=0&limit=25` | Bell-icon counter data. Array of task categories. |
| `PUT /agrprod/api/session/current?renew=true`   | Renews the Unit4 session. |
| `GET /agrprod/api/documents/{client}/{docType}/{uuid}/1/1/1?_parentAccessId={pid}&_accessId={aid}` | **The document binary endpoint** — returns the raw `Faktura.htm` for `EI02`, the PDF for `OVRDOK`. Needs the access IDs from the discovery cache. |

### Browser-required (activity-context gated)

| Endpoint                                        | Purpose                                |
| ----------------------------------------------- | -------------------------------------- |
| `POST /agrprod/api/documents/{client}/doctypesandkeys?ind={client};{vernr};{period}` | Maps invoice number to list of `{docType, [uuid]}`. Only returns data after the UI has set up the activity-context session. Captured during discovery via `read_network_requests`. |
| `POST /agrprod/api/topgen/session/{stepId}/clearpresavedocument`  | Activity-step session initialiser. Used implicitly by the UI. |
| `GET /agrprod/Container.aspx?type=topgen&menu_id={accessId}&activityStepId={n-m}&{queryString}` | The HTML container that establishes the per-task ASP.NET session. |

All API responses are `application/json; charset=utf-8` except the
document binary endpoint (which returns HTML / PDF / etc).

### Cookies needed

The standard SAML / .NET ones at `agrprodweb01.ug.kth.se`:
`FedAuth`, `FedAuth1`, `.ASPXAUTH`, `ASP.NET_SessionId`, `LoggedIn`.
These are exported from the browser via the Chrome extension into
`~/.config/kth-cli/.cookies-agrprod.txt` (Netscape format) for `curl`
to consume.

### Discovery cache

Discovery results land in `~/.config/kth-cli/.efh-cache/<vernr>.json`.
Each cache entry holds: `vernr`, `client`, `period`, `access_id`
(per-document permission, e.g. `CR398`), `parent_access_id` (queue
permission, e.g. `AP278`), and the list of `{docType, uuid}` for the
invoice + every attached document. Subsequent `kth efh invoice <vernr>`
calls read this and skip the browser entirely.

## Common patterns

### Cron one-liner: ping me when invoices land

```bash
# In crontab; mail any pending count > 0.
*/15 * * * * c=$(kth efh count); [ "$c" -gt 0 ] && echo "EFH: $c pending" | mail -s 'EFH' me
```

### As an agent: decide whether to open the approval screen

```python
import json, subprocess
out = subprocess.check_output(["kth", "efh", "tasks"])
tasks = json.loads(out)
for t in tasks:
    if t["process"] == "EFH" and t["count"] > 0:
        # Build the deep link URL
        url_args = ["kth", "efh", "url", t["viewId"], t["queryString"]]
        url = subprocess.check_output(url_args).decode().strip()
        # Navigate to it via Chrome extension
        print(f"Open in Chrome extension: navigate to {url}")
```

## Architecture: read in curl, write in browser

Empirically validated 2026-05-23 by capturing a real Ekonomisk attest:

- **Read endpoints are JSON over HTTPS** (tasknotifications, session/current,
  document binaries). Pure-curl with the exported cookie jar works for
  these — they're the basis of `kth efh tasks/count/session/url/invoice/summary`.
- **Every write endpoint is an ASP.NET WebForms postback to
  `/agrprod/ContentContainer.aspx`** with a server-encrypted, server-signed
  `__VIEWSTATE` blob. The `__VIEWSTATE` is rotated on every page load, so
  curl replay is structurally impossible.
- Therefore: **write actions use the Chrome extension** (claude-in-chrome
  MCP) to interact with the live UI. For irreversible actions (Ekonomisk
  attest above all), the agent prepares the screen and the user clicks the
  final button.

## Standard operating procedure

A full distillation of KTH's official manuals lives at
[references/SOP.md](references/SOP.md). Read that file when:

- the user asks "what do I do with this invoice?"
- you need to know which button does what
- you need the list of required attachments per invoice type
- you need to recognize a conflict-of-interest situation

The source PDFs (Swedish + English KTH manuals, flow diagram, amount
explanation, what's-new note, company-settings doc) are in
[references/pdf/](references/pdf/) for verbatim citation.

## User's project-routing rules

Wei's personal mapping from invoice purpose to Unit4 project number is
in [references/project-accounts.yaml](references/project-accounts.yaml).
When proposing a `Proj` value, evaluate the rules in order — first
match wins — and fall through to the `default` if nothing matches.

## Known limitations / future work

- **Drilling into one invoice via API is incomplete.** The endpoint
  `POST /api/documents/UF/doctypesandkeys?ind=UF;<vernr>;<period>` is
  the right entry but it returns `[]` from curl despite identical
  headers to the working browser call. It needs a session-bound activity
  context (the Unit4 UI sets up an `activityStepId` via `Container.aspx`
  before hitting this). Discovery must therefore go through the Chrome
  extension.
- `kth efh url` is a best-effort URL builder; Unit4 may expect the
  query string in a slightly different shape for some views. Verify
  in the browser first.

## Presentation contract (every `kth efh summary` MUST follow)

When an invoice has been found, present it as:

1. **Details panel** — vernr, supplier, customer, dates (invoice + due),
   total amount, currency, cardholder if it's a Eurocard statement, COI
   flags, line-item count.
2. **Top line items** by amount (top 10 minimum), so the user can spot
   anomalies.
3. **Suggested project** with rule_id, matched keyword, and the cost
   centre + label. If the invoice is heterogenous (multiple kinds of
   merchant), flag that explicitly and propose a split.
4. **Draft comment** for *Logg arbetsflode* (Swedish preferred — the
   approver chain reads Swedish).
5. **Decision options** — Approve, Split, Park, Reject, Escalate — each
   listed with what the user would do in the Chrome extension.

The agent never auto-confirms an approval. Always stops before the
final money-moving click.

## What this skill should never do

- **Approve / reject / pay** any invoice on the user's behalf, even
  if the user previously said it was OK for a similar invoice. Each
  approval is a separate authorization. Always stop and let the user
  click the final button in the browser.
- **Hardcode `client=UF` or `user=WEIO`** in scripts — use
  `kth efh session` to discover them.
- **Cache or commit** `~/.config/kth-cli/.cookies-agrprod.txt`.
  It contains live SAML / .NET session cookies.
- **Auto-set Proj or auto-write comments** without showing the user
  the proposal first. The right pattern is "suggest, then user
  confirms".
- **Approve a Sakattestera item without a user-confirmed comment.**
  Every Sakattestera invoice requires a comment from the user before
  approval: summarize what the invoice is, draft a comment, get the
  user to confirm/edit it, and only then let the user click
  Sakattestera. No comment → no approval.

## Recommended agent flow for the user

When the user says "I have an EFH task to handle" or similar:

1. `kth efh count` — confirm there is something to do.
2. `kth efh tasks` — see what categories are pending.
3. Navigate to the EFH URL via Chrome extension:
   ```
   navigate: https://agrprodweb01.ug.kth.se/agrprod/
   ```
4. Use `read_page` / `find` to locate and click the task bell, then the
   task row. Read the `Bilaga` (attachment) `1 - Faktura.htm` to
   understand what the invoice is for. Summarize for the user.
5. Match the invoice context to `references/project-accounts.yaml`
   and propose: which project, a draft comment, which button to click.
6. **Stop.** The user makes the actual click in the browser.

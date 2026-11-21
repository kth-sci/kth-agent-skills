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
   **Only the `kth efh` CLI needs this.** For browser-driven work (which is all of
   Sakattestera) skip the jar entirely — a synchronous XHR inside the warm page already
   carries the cookies. See "Sakattestera" §0b.

## Logging in (browser-driven work)

Use [`bin/kth-mfa-login.sh`](../../bin/kth-mfa-login.sh):

```bash
kth-mfa-login.sh https://agrprodweb01.ug.kth.se/agrprod/ [page-id]
```

It navigates the page, reads the number-match digits **from the live login page**, approves
in the registered Authenticator, and confirms by `location.host`. Usually it lands with no
MFA at all, because the ADFS cookie outlives the Unit4 app session.

⚠ **Do not use `kthmfa-approve <digits>` — it reports success while doing nothing.** On
2026-11-21 it printed *"approval dialog detected — typing NN / digits typed, YES tapped"*
three times in a row while the Authenticator number field stayed literally empty
("Enter number here") and the YES button stayed disabled; the login page then timed out with
*"We didn't receive a response."* The working sequence, which `kth-mfa-login.sh` implements:

1. `am start -n com.azure.authenticator/.ui.LaunchActivity` — foreground the app.
   **Never `adb shell input keyevent 4`** to clear a stale dialog: that sends Authenticator
   to the home screen and the push dialog never renders again.
2. `input tap 542 898` (number field) → `input text <digits>`
3. **dump the UI and verify** `text="<digits>"` on `auth_enter_correct_num_text_input`
   **and** `positiveButton enabled="true"` — this is the only real evidence a tap will count
4. `input tap 881 1045` (YES)
5. confirm by reading `location.host`, never by the tap returning

The whole thing must fit inside the ~60 s challenge window, so it has to be one unbroken
run. Also note `kth-login` is the wrong tool here: its `landed` check only recognises
`wisum.its.umu.se` and it spins on an EFH target.

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

3. **For money-moving actions** (Ekonomisk attest — payment release): the
   agent prepares the screen (verifies Proj column, amount, adds comments
   if needed), then **re-states the supplier + amount and asks for fresh,
   explicit consent for that specific invoice**. The agent may click the
   final button **only after** the user says yes to that invoice. Consent
   is per-invoice and never carries over; no standing or unattended
   approval.

4. **For reversible actions** (Parkera, add comment): the agent can
   fill forms via `javascript_tool` or `form_input`, but should still
   confirm with the user before clicking submit.

5. **For Sakattestera (factual attest):** EVERY Sakattestera item
   **requires a comment from the user** before it is approved. The agent
   must, for each invoice in the queue: (a) read the `Faktura.htm` and
   summarize what the invoice is for, (b) draft a proposed comment
   describing it, (c) **present that draft and get the user to confirm or
   edit the comment**, and only then (d) — with the user's explicit
   per-invoice consent — set the Proj and click Sakattestera. Never
   approve a Sakattestera item without a user-confirmed comment **and**
   explicit consent for that item. Consent does not carry to the next
   invoice.

This is a **soft consent gate**: the agent is permitted to click the
final attest button, but only on fresh, explicit, per-action human
consent given in the same session — never blanket, standing, or
unattended. Without consent the agent stages everything and the user
clicks.

### Available write verbs (all via Chrome extension)

| Action | Effect | Final click |
| ------ | ------ | ----------- |
| Ekonomisk attest | Approve the invoice (payment release) | Agent may click **only after fresh per-invoice consent** (supplier + amount re-stated) |
| Sakattestera | Factual approval (goods received) | Agent may click **after a user-confirmed comment + explicit per-item consent** |
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

For **how to classify an invoice** (read the godsmärke, map line items to
a funding rule, write a short Swedish comment, and the Sakattestera
screen flow), see the accumulated heuristics in
[references/invoice-classification-heuristics.md](references/invoice-classification-heuristics.md).
Use them to make a confident first suggestion instead of asking from
scratch; only ask the user when two funding rules could plausibly apply
(e.g. a laptop coded to a specific person's fellowship vs. lab hardware).

## Sakattestera: the working automation recipe (SOLVED 2026-11-17, batch-proven 2026-11-21)

### The tooling — use this, don't re-derive it

| script | what it does |
| ------ | ------------ |
| [`bin/kth-efh-attest.sh`](../../bin/kth-efh-attest.sh) | **the one you want.** Codes and attests ONE invoice end to end: relogin → open queue → pick invoice → set Proj → verify → comment → attest → verify the count dropped. `--stage-only` stops before the click. |
| [`bin/kth-efh-eval.sh`](../../bin/kth-efh-eval.sh) | run any expression against the live form: `kth-efh-eval.sh <page> 'state()'` |
| [`bin/kth-efh-prelude.js`](../../bin/kth-efh-prelude.js) | the helpers it injects — `live`, `g()`, `api()`, `docText()`, `currentDocUuid()`, `openTaskList()`, `openQueue()`, `pickInvoice()`, `invoiceList()`, `state()`, `dimSearchSync()`, `setDim()`, `setComment()`, `sakattestera()`, `taskCounts()` |
| [`bin/kth-mfa-login.sh`](../../bin/kth-mfa-login.sh) | login + **verified** MFA approval (see "Logging in" below) |
| [`bin/kth-efh-sakattest.js`](../../bin/kth-efh-sakattest.js) | the original annotated writeup of the form mechanics — read its header before changing any helper |

Proven on 2026-11-21: four invoices coded and attested, queue 4 → 0, one
`kth-efh-attest.sh` run each.

### ⚠ 0. Do a whole invoice in ONE process — the session dies in minutes

The Unit4 **app** session expires after a few minutes idle, and it expires by **collapsing
every frame to `Logout.aspx`**. A half-coded invoice is then simply gone and `state()` starts
answering `no live frame`. It died twice between agent tool calls on 2026-11-21.

So never spread one invoice across several agent tool calls. Drive it with
`kth-efh-attest.sh`, which runs the whole sequence as one uninterrupted process.

The SAML/ADFS cookie **outlives** the app session, so the relogin is usually silent (no MFA
at all) — it is cheap, so always relogin rather than assuming the session is alive. And since
every invoice is re-entered from the queue, a relogin mid-batch costs nothing.

### ⚠ 0b. `myco nav eval` is synchronous-only

Three constraints that shape every helper:

- **No `await`.** A returned promise serialises to `{}`. Use synchronous
  `XMLHttpRequest`, not `fetch()`.
- **A top-level `var` makes the whole eval return `null`.** Wrap everything in a function.
- **Globals do not persist between calls** — you cannot install helpers once. That is exactly
  why `kth-efh-eval.sh` re-injects `kth-efh-prelude.js` on every call.

A bonus: a synchronous XHR inside the warm page **reuses the browser's own cookies**, so for
browser-driven work the `kth efh` curl cookie jar is unnecessary.

### ⚠ 1. There are TWO copies of the form. One is DEAD.

| frame | role |
| ----- | ---- |
| `ContentContainer.aspx?...menu_id=AP278` | **the LIVE form — drive this** |
| `CopyContainer.aspx` | a visual CLONE for the display pane — **inert** |

`System/Scripts/copyContainer.js` replaces these with **empty functions** in the clone:
`__doPostBack`, `setDirty`, `PostBack`, `HighlightTextBox`, `ResetTextBox`,
`checkFocusAndDoPostBack`, `trapEnter`, `postBackOnEnter`.
So in the clone **every postback silently does nothing**. Pick the frame by testing that
`__doPostBack` is NOT `/^function\(\)\{\}$/` — never by "first document containing the field id"
(that finds the clone first).

### 2. The dimension fields are LOOKUPS, not text boxes

`<datalistcontrol>` + hidden `_RowValue` / `_RowDescription` hold the real value; the visible
`_Editor` is cosmetic and typed text is discarded. Row field ids:
**123=Konto, 276=Proj, 281=Dim 7, 282=Momskod**. Org/dim_1 has **no input** — it is derived.

**Backend search API** (from `ServersideLookup`; also visible in the browser network tab):

```
POST /agrprod/System/Services/DataListService.aspx
Search=<term>&Context=<base64>&BatchStart=1&BatchSize=50
→ <list><item><value>89256</value><descr>KAW DDLS fellows Wei(…)</descr></item>…</list>
```

`Context` = the `<datalistcontrol context="…">` attribute, base64 of
`TFI004^<activity-guid>^AP278^UF^<fieldId>^n`. **The GUID rotates — re-read it from the DOM
every time.** Use `dimSearch(fieldId, term)` to list valid values for any dimension.

### 3. The sequence that actually commits

Mirrors what a human does (user, 2026-11-17: *"I type the number, select from the list, then I
click outside the box, something computes, and then it lets me submit"*):

1. `setDim("276", "89256", "KAW DDLS fellows Wei(2301-2712/2020.0239)")`
   — internally: `Popup.SetEditorValues(v, d)` → force `_IsDirty="true"` →
   **`LeaveDataListControl(null, el)`** ← this blur is what makes the server recompute
   **Org `VAX LEVSKULD EFH` → `SKEG Biofysik Ouyang`**
2. wait ~15 s for the postback, then `checkState()` — require `error === ""` **and**
   `orgLooksRight === true` before going on
3. `setComment("…")` (sets the text **and** its `_IsDirty`)
4. `sakattestera()` — finds the button by text (its id is not stable: `b$tbl_headbutt_10`/`_11`/…)
5. verify with `taskCounts()` — the API is authoritative, the header badge goes stale

### 4. Pitfalls that each cost hours

- **Never change Konto.** The server reverts it *and* it breaks the Org derivation, giving
  `Korrigera följande: Org: Värdet för fältet dim_1 = 'SKEG' är fast.` Konto stays
  `5000 Ankomstregistrering EFH`; on Sakattestera you change **only Proj** (matches the on-screen
  step 5 *"Fyll i projekt (byt ut dummyproj)"*).
- **Never call `CheckIfControlIsDirty()` first** — it re-evaluates and **clears** `IsDirty`
  (because `SetEditorValues` already synced Editor↔RowValue), so the server discards the change.
- `PostBack(base)` alone sets the value but does **not** recompute Org. Use `LeaveDataListControl`.
- `myco nav read` cannot see inside iframes, and `nav act type/key` needs a ref — so trusted
  typing is not available; the widget-API route above is the way.
- `myco nav shot` often times out on this page while `eval` keeps working.
- **The Sakattestera button id really is unstable** — observed `b$tbl_headbutt_10` on the
  first invoice of a batch and `b$tbl_headbutt_11` on the next three. Always find it by text.
- The EFH session drops often — see §0. `bin/kth-mfa-login.sh` handles it; `kth-login` does
  not (its `landed` state only recognises `wisum.its.umu.se`, so it spins on an EFH target).
- å/ä/ö survive the `myco nav eval` channel intact, so comments can be written in real Swedish.

### 5. Verified project codes (query live with `dimSearch("276", …)`)

| code | description |
| ---- | ----------- |
| 89256 | KAW DDLS fellows Wei (2301-2712/2020.0239) |
| 89299 | GGS Wei (2317/2307-2712) |
| 866513 | Biofysik/GEMENSAMMA KOSTN OUYANG |
| 88314 | EU RI-SCALE 101188168 W. Ouyang |
| 89481 | KAW DDLS WASP 2025:017 Ouyang |

The consent rules in "What this skill should never do" are unchanged: a user-confirmed comment
**and** explicit per-item consent before each `sakattestera()`.

## Known limitations / future work

- **Drilling into one invoice via API is incomplete.** The endpoint
  `POST /api/documents/UF/doctypesandkeys?ind=UF;<vernr>;<period>` is
  the right entry but it returns `[]` from curl despite identical
  headers to the working browser call. It needs a session-bound activity
  context (the Unit4 UI sets up an `activityStepId` via `Container.aspx`
  before hitting this). Discovery must therefore go through the Chrome
  extension.

  **You usually don't need it.** Reading an invoice does not require the discovery cache at
  all — once the UI has the invoice open, the document iframe's own URL carries the uuid:

  ```bash
  kth-efh-eval.sh <page> 'pickInvoice("<vernr>")'    # wait ~9 s
  kth-efh-eval.sh <page> 'docText(currentDocUuid())' # the full PEPPOL invoice as text
  ```

  That reads every line item, passenger, order reference and godsmärke in one call, with no
  cache file, no cookie jar and no PDF download.
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

The agent never auto-confirms an approval on its own. It clicks the
final attest button only after fresh, explicit, per-invoice consent —
see the soft consent gate in "Workflow for write actions".

## What this skill should never do

- **Approve / reject / pay an invoice without fresh per-invoice consent.**
  The agent may click the final attest button, but only after the user
  gives explicit consent for *that specific invoice* in the same session.
  Consent for one invoice never authorizes another, and consent never
  carries across sessions. No blanket, standing, or unattended approval.
  For payment-release (Ekonomisk attest), re-state supplier + amount and
  get a fresh yes first.
- **Hardcode `client=UF` or `user=WEIO`** in scripts — use
  `kth efh session` to discover them.
- **Cache or commit** `~/.config/kth-cli/.cookies-agrprod.txt`.
  It contains live SAML / .NET session cookies.
- **Auto-set Proj or auto-write comments** without showing the user
  the proposal first. The right pattern is "suggest, then user
  confirms".
- **Approve a Sakattestera item without a user-confirmed comment AND
  explicit consent.** Every Sakattestera invoice requires a comment the
  user has confirmed/edited, plus explicit per-item consent, before the
  agent clicks Sakattestera. No comment or no consent → no approval.

## Recommended agent flow for the user

When the user says "I have an EFH task to handle" / "what should I approve?":

```bash
P=$(myco nav open https://agrprodweb01.ug.kth.se/agrprod/ --background --id)
kth-mfa-login.sh https://agrprodweb01.ug.kth.se/agrprod/ "$P"
kth-efh-eval.sh "$P" 'taskCounts()'                 # anything to do? which queue?
kth-efh-eval.sh "$P" 'openTaskList()'; sleep 5
kth-efh-eval.sh "$P" 'openQueue()';   sleep 10
kth-efh-eval.sh "$P" 'invoiceList()'                # supplier / amount / due / vernr
# per invoice: read what it is actually for
kth-efh-eval.sh "$P" 'pickInvoice("<vernr>")'; sleep 9
kth-efh-eval.sh "$P" 'docText(currentDocUuid())'
```

Then, for each invoice:

1. **Summarize what it is for** from `docText` — line items, orderer reference, order number,
   passenger + dates for travel. Flag anything that looks off against the header amount.
2. **Propose a project** from `references/project-accounts.yaml`, and verify the code exists
   with `dimSearchSync("276", "<code>")` rather than trusting the table.
3. **Draft the comment** (Swedish). Travel needs **dates out and home, destination and
   purpose** — if you don't know the purpose, ask; don't invent one.
4. **Show the user** supplier, amount, project and the draft comment, and get their
   explicit confirmation of the comment plus explicit consent for *that* invoice.
5. Only then: `kth-efh-attest.sh "$P" <vernr> <proj> "<projDescr>" "<comment>"`
   (or `--stage-only` if the user prefers to click it themselves).
6. Report the `taskCounts()` before/after as the evidence it worked.

Never batch step 4 away: consent is per invoice and never carries over.

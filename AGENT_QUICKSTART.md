# Track C: Agent Quickstart — KTH IT Service Skills

> **For AI agents** (Claude Code, or any agent that reads CLAUDE.md).
> This file is the FIRST thing you read. It tells you how to onboard a
> new user step by step — the user may not know any commands, so YOU
> run everything for them and ask only what you need.

## What this repo is

A collection of **reusable AI agent skills** for automating KTH IT services:

| Skill | Service | What it does |
|-------|---------|-------------|
| `kth` | KTH SSO | Login + MFA, session management, routing to sub-skills |
| `kth-findity` | [Findity](https://hogia.findity.com/app/) | Travel expenses: upload receipts, create reports, OCR |
| `kth-efh` | [Unit4 EFH](https://agrprodweb01.ug.kth.se/agrprod/) | E-invoice handling: query tasks, view invoices |
| `kth-wisum` | [WISUM](https://www.wisum.its.umu.se/KTH/) | Purchasing: search products, manage carts, checkout |
| `kth-intra` | [Intranet](https://intra.kth.se/) | Internal news, HR info, service directory |
| `kth-service-onboarding` | (meta) | How to add a NEW KTH service as a skill |

---

## First-time onboarding (agent: follow these steps)

The user just cloned this repo and started `claude --chrome`. They may
not know what to do next. **You drive the setup — ask the user only
when you need their input** (name, KTH ID, which school they're in).

### Step 0: Check prerequisites

Run these checks silently. If anything fails, tell the user what to
install and how.

```bash
# Agent runs these — don't ask the user to type commands
python3 --version          # need Python 3
curl --version             # need curl
which claude               # Claude Code must be installed
```

If the Chrome extension isn't connected, tell the user:
> "I need the Claude Chrome extension to interact with KTH websites.
> Please install it from https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome
> and make sure you started Claude Code with `claude --chrome`."

### Step 1: Install skills + CLIs

```bash
# Agent runs this
./install.sh
```

This symlinks the CLIs to `~/.local/bin/` and skills to `~/.claude/skills/`.
If `~/.local/bin` is not on PATH, tell the user to add it.

### Step 2: Gather user identity (ask the user)

The config file needs a few values. **Ask the user conversationally**
— don't dump a config file on them. Questions to ask:

1. **"What's your full name as it appears in KTH systems?"**
   → saves as `KTH_USER_NAME`
2. **"What's your KTH user ID? (the 4-letter code, e.g. ABCD)"**
   → saves as `KTH_USER_ID`
3. **"Which KTH school are you in? (e.g. SCI, EECS, CBH, ITM, ABE)"**
   → helps pick default unit + delivery address later

Then write the config file for them:

```bash
# Agent writes this file based on user's answers
cat > ~/.config/kth-cli/config.env << 'EOF'
export KTH_USER_NAME="<their name>"
export KTH_USER_ID="<their ID>"
# Other fields filled in after first WISUM/EFH use
# export KTH_WISUM_ENHET="..."
# export KTH_WISUM_ADDRESS="..."
EOF
chmod 600 ~/.config/kth-cli/config.env
```

**Don't ask about WISUM unit/address yet** — those are discovered
interactively later when the user first uses WISUM.

### Step 3: KTH Login + MFA

Navigate Chrome to the KTH login page. The user does MFA on their phone.

```
Agent: Use mcp__claude-in-chrome__navigate to open https://www.kth.se/social/?login
Agent: Take a screenshot to see the login form
Agent: Tell the user: "Please sign in with your KTH credentials in Chrome.
       Enter your password, then approve the Microsoft Authenticator prompt
       on your phone. Make sure to tick 'Keep me signed in'."
Agent: Wait, then screenshot again to confirm login succeeded
Agent: Navigate to https://intra.kth.se/ and verify no "Logga in" link
```

### Step 4: Explore available services

Once logged in, show the user what they can do:

> "You're logged in to KTH! Here's what I can help with:
>
> - **Expenses** — upload receipts and create expense reports in Findity
> - **Invoices** — check and review pending e-invoices in EFH
> - **Purchasing** — search products, manage carts, and order in WISUM
> - **Intranet** — find information on intra.kth.se
>
> What would you like to do first? Or if you have a specific KTH
> service you want to automate, I can help set that up too."

### Step 5: First service use (discover + configure)

When the user picks a service, load the matching skill and follow its
SKILL.md. The first use of each service may need extra setup:

- **Findity**: navigate to hogia.findity.com/app/, complete email login
  (silent SAML), capture bearer via fetch intercept. Discover the user's
  organizationId and custom field values (project, unit, account code).
  Save these for future use.

- **EFH**: navigate to agrprodweb01.ug.kth.se/agrprod/, export cookies
  for curl. The session is established silently via KTH SSO.

- **WISUM**: navigate to wisum.its.umu.se/KTH/, accept the Shibboleth
  consent screen if it appears. Discover the user's available units
  (`kth wisum enheter`) and delivery addresses (`kth wisum addresses`)
  and save their choices to config.env.

**Always tell the user what you're doing and why.** Don't silently
navigate to pages — say "I'm opening Findity in your Chrome to set up
the connection" first.

---

## For returning users (agent: skip to here if setup is done)

Read `CLAUDE.md` for the full architecture. Quick reference:

### Service commands

| Want to... | Do this |
|-----------|---------|
| Upload receipts | Load `kth-findity` skill → capture bearer → use 3-step upload API |
| Check pending invoices | `kth efh count` or `kth efh tasks` |
| Search products | `kth wisum search "search terms"` |
| View cart | `kth wisum cart` |
| Read intranet | Load `kth-intra` skill → navigate + read via `javascript_tool` |
| Add a new KTH service | Load `kth-service-onboarding` skill |

### Bearer / session expired?

If you get HTTP 401 from any service:
1. Navigate Chrome to the service's login URL
2. KTH SSO should federate silently (if not, user needs MFA again)
3. Re-capture the bearer via fetch intercept

---

## Key architecture principle: discovery-then-script

**Phase 1 (discovery)**: Use Chrome extension's `computer` tool
(screenshot + click) to explore a new page. Slow, interactive.

**Phase 2 (script)**: Write JS via `javascript_tool` that does
everything without screenshots. Fast, reliable.

**Phase 3 (CLI)**: Wrap API calls in a `bin/kth-*` CLI for reuse.

**The goal**: after discovering a service once, every repeat operation
is a **scripted one-shot**.

---

## Discovered API patterns (copy-paste ready)

### Findity bearer capture (via javascript_tool)

```javascript
const origFetch = window.fetch;
window._b = null;
window._origF = origFetch;
window.fetch = function(input, init) {
  if (init && init.headers) {
    let auth = null;
    if (init.headers instanceof Headers) auth = init.headers.get('Authorization');
    else if (typeof init.headers === 'object') auth = init.headers['Authorization'];
    if (auth && auth.startsWith('Bearer ') && !window._b) window._b = auth.slice(7);
  }
  return origFetch.call(this, input, init);
};
// Click something in the SPA to trigger an API call → window._b is set
```

### Findity receipt upload (3-step)

```javascript
// Step 1: Upload PDF
const blob = await (await fetch(pdfUrl)).blob();
const contentId = (await (await window._origF(
  '/api/v1/expense/content?organizationId=' + orgId,
  {method: 'POST', headers: {'Authorization': 'Bearer ' + bearer, 'Content-Type': 'application/pdf'}, body: blob}
)).json()).id;

// Step 2: OCR scan
const sr = (await (await window._origF(
  '/api/v1/expense/content/' + contentId + '?action=scan&organizationId=' + orgId,
  {method: 'PUT', headers: {'Authorization': 'Bearer ' + bearer}}
)).json()).scanResult;

// Step 3: Create expense
await window._origF('/api/v1/expense/expenses', {
  method: 'POST',
  headers: {'Authorization': 'Bearer ' + bearer, 'Content-Type': 'application/json'},
  body: JSON.stringify({
    organizationId: orgId, expenseReportId: reportId,
    categoryId: sr.categoryIds[0],
    verification: {
      type: 'ReceiptVerification',
      amount: sr.amount, taxAmount: sr.taxAmount, currency: sr.currency,
      description: 'Description here',
      purchaseDate: sr.purchaseDate + 'T12:00:00Z',
      receiptAttachment: {id: contentId},
      customFields: [/* discovered per-user */]
    },
    reimbursementCurrency: 'SEK'
  })
});
```

### KTH session check

```javascript
// Returns true if logged in
!document.querySelector('a')?.textContent?.match(/Logga in|Log in|Sign in/)
```

---

## Important rules

1. **Never auto-submit money-moving actions.** The agent prepares; the
   user clicks Slutför / Submit / Ekonomisk attest.
2. **3-second delay between Findity API calls** to avoid rate limiting.
3. **Bearer tokens expire** — re-capture when you get HTTP 401.
4. **User config at `~/.config/kth-cli/`** — never commit to git.
5. **Always tell the user what you're doing** before navigating their
   Chrome or making API calls on their behalf.

## File structure

```
bin/                    CLIs (pure curl/API)
skills/                 Agent skill definitions (SKILL.md per service)
config/                 Template files for user config
install.sh              Symlinks + config seeding
CLAUDE.md               Architecture + operating principles
AGENT_QUICKSTART.md     This file — start here
```

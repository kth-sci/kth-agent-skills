# KTH Agent Skills — AI agents for KTH IT services

## Aim

This repo (`kth-agent-skills`, originally built for Track C of the SCI Agenthon 2026) is a **collection of reusable agent skills** that let an AI
agent (Claude, or anything that understands the
[Agent Skills specification](https://agentskills.io/specification))
operate KTH IT services from a single command-line interface.

It doubles as an **educational reference** for faculty and staff at KTH
who want to learn how to build their own agent skills — the
discovery-then-curl methodology, the irreversible-writes-stay-in-browser
principle, HAR-based endpoint capture, and so on. See `README.md` for
the human-facing walkthrough.

> ⚠️ **READ THIS BEFORE USING ANYTHING IN THIS REPO**
>
> 1. This project is **educational**. It demonstrates how to build agent
>    skills for KTH-style SAML-protected services.
> 2. **KTH IT policy may not permit automation** of every service this
>    repo touches. Use is at your own risk and may violate institutional
>    policy. Check with KTH IT if in doubt.
> 3. **AI agents make mistakes.** Every action this repo performs needs
>    to be verified by the user — especially anything irreversible
>    (purchase orders, invoice approvals, payments, sent emails).
> 4. The agent **must never** auto-submit money-moving actions. The
>    architecture forbids it: see the
>    `feedback-irreversible-writes-stay-in-browser` memory.
>
> When you (the agent) act in this repo, surface this disclaimer to the
> user if they're about to do anything they haven't done before — and
> always pause for confirmation before any final submit / approve click.

## Architecture

The agent uses the **Claude Chrome extension** (`mcp__claude-in-chrome__*`)
to interact with KTH web services in the user's own Chrome browser.
No separate browser process, no agent-browser daemon, no Chrome for
Testing. One browser, one session, one set of cookies.

```
┌─────────────── kth-agent-skills/ ──────────────────────────────────┐
│                                                                    │
│  bin/                                                              │
│   ├── kth-efh             Unit4 EFH e-invoice CLI (pure curl).     │
│   ├── kth-efh-parse       EFH HTML parser + project router.        │
│   ├── kth-wisum           KTH WISUM purchasing CLI (curl + JS).    │
│   ├── kth-findity         Findity expense CLI (bearer + curl).     │
│   ├── kth-findity-upload  Batch receipt upload (bearer + API).     │
│   ├── kth-findity-process Post-upload PATCH automation.            │
│   ├── kth-receipts        OpenAI/Anthropic Admin API billing.      │
│   └── kth-canvas          Canvas LMS read + markdown dump (token). │
│                                                                    │
│  config/                  Templates only — no real user data:      │
│   ├── kth-cli.example.env  → ~/.config/kth-cli/config.env          │
│   ├── project-accounts.example.yaml                                │
│   └── secrets.example.env  → ~/.config/kth-cli/secrets.env         │
│                                                                    │
│  skills/                  agentskills.io-compliant skill folders:  │
│   ├── kth/                ← main KTH entry skill                   │
│   ├── kth-findity/                                                 │
│   ├── kth-intra/                                                   │
│   ├── kth-efh/                                                     │
│   ├── kth-wisum/                                                   │
│   ├── kth-canvas/                                                  │
│   ├── kth-prisma/           ← VR/Vetenskapsrådet grant portal     │
│   └── kth-service-onboarding/  ← meta-skill: add a new KTH service │
│                                                                    │
│  install.sh               Symlinks CLIs and skills, seeds the      │
│                           user config from templates if missing.   │
└────────────────────────────────────────────────────────────────────┘
```

**Two tiers of automation:**

| Tier | Tool | When to use |
| ---- | ---- | ----------- |
| **Browser** | Claude Chrome extension (`mcp__claude-in-chrome__*`) | Login/MFA, Flutter SPAs (Findity), form filling, any page the user sees. Uses `javascript_tool` for fast scripted automation, `computer` for clicks, `read_network_requests` for API discovery. |
| **API** | curl / Python `fetch()` via `javascript_tool` | Pure read/write once endpoints are known. Bearer tokens captured via `javascript_tool` in the live page. CLIs in `bin/` wrap these API calls. |

## Auth model

`login.kth.se` issues a long-lived IdP cookie on `*.kth.se` once a user
completes username + password + Microsoft Authenticator.

- **Login**: the agent navigates the user's Chrome to the KTH SSO URL
  via `mcp__claude-in-chrome__navigate`. The user completes MFA. The
  agent ticks "Keep me signed in" (extends ~12h → ~7d).
- **Downstream services** (Findity, EFH, WISUM, intra.kth.se): the
  agent navigates to the service URL. SAML federation is silent because
  the KTH SSO cookie is already in the user's Chrome.
- **Bearer capture** (Findity): override `window.fetch` via
  `javascript_tool` to intercept the `Authorization: Bearer` header
  from the SPA's API calls. Store in a page-context global for reuse.

## Operating principles for agents working in this repo

### The discovery-then-script methodology

Every KTH service follows a two-phase arc:

**Phase 1 — Discovery** (once per service, via Chrome extension):
Use `computer` (screenshot + click), `read_page`, `read_network_requests`
to explore the service. Identify: auth model, API endpoints, request
shapes, required fields, form layouts. This phase is slow and
interactive — that's expected.

**Phase 2 — Script** (every subsequent use, via `javascript_tool`):
Write JS that runs in the page context to do everything without
screenshots. Capture auth by intercepting `window.fetch`, call APIs
via in-page `fetch()`, fill forms via DOM manipulation, read results
via JSON parsing. This phase is fast — no round-trip screenshots, no
coordinate-based clicking. The JS scripts go into `skills/<service>/`
and `bin/` CLIs for reuse.

**The goal**: after discovering a service once, every repeat operation
is a **scripted one-shot** — fast, reliable, no visual interaction.
The Chrome extension's `javascript_tool` is the workhorse; `computer`
(screenshot/click) is only for initial exploration.

### Core rules

1. **Chrome extension for discovery, JS scripts for execution.** The
   first time you encounter a service, use `computer` to explore. Then
   write a `javascript_tool` script that automates it. Never do
   screenshot→click loops for repeated operations.
2. **Irreversible writes stay with the user.** The agent prepares the
   form/state but the user clicks the final submit button (Slutför,
   Ekonomisk attest, Skicka in). The agent **must never** auto-submit
   money-moving actions.
3. **Never commit user config or credentials.** Bearer tokens, cookies,
   API keys, and `~/.config/kth-cli/` live outside the repo.
4. **Update memory when you learn something architectural** about a
   service. Future sessions read memories before re-discovering.
5. **Surface the disclaimer above** to the user the first time in a
   session they're about to do something irreversible.

### Patterns discovered per service

| Service | Auth capture | Fast-path automation |
| ------- | ------------ | -------------------- |
| **Findity** | Intercept `window.fetch` → capture `Authorization: Bearer` | `POST /api/v1/expense/content` (raw PDF) → `PUT content/{id}?action=scan` → `POST /api/v1/expense/expenses`. See `kth-findity-upload`. |
| **EFH (Unit4)** | Cookies from warm Chrome session | JSON API at `/agrprod/EI02/rest/*`. Pure curl with cookie jar. |
| **WISUM** | Shibboleth cookies from warm Chrome | ASMX JSON at `/KTH/ws/TreeWebService.asmx`. Pure curl. Checkout wizard needs `computer` clicks (ASP.NET postbacks). |
| **Intra** | KTH SSO cookie in Chrome | Read-only page scraping via `javascript_tool`. |
| **Canvas** | Personal access token minted at `/profile/settings`, read from the post-Generate dialog via `javascript_tool`, stored at `~/.config/kth-cli/.canvas-token` | REST API at `/api/v1/*`. Pure curl with `Authorization: Bearer`; pagination follows `Link: rel="next"`. `kth canvas dump <id>` exports a course to markdown. |
| **Prisma (VR)** | SAML cookie in warm Chrome; user logs in (never the agent). Form opens READ-only → click "Open in edit mode" | Scripted `javascript_tool` in the live page (ASP.NET MVC + jQuery + TinyMCE; anti-CSRF → no pure curl). GUID-named fields, native-setter + event dispatch, `tinyMCE.setContent`. Some commits (SCB Add, grid rows, CV add/remove) need a real `computer` click. **Agent never clicks Register/Submit.** See `kth-prisma`. |

## Services on the roadmap

| URL                                         | Internal name      | Skill                | Status     |
| ------------------------------------------- | ------------------ | -------------------- | ---------- |
| `https://www.kth.se/social/?login` (SSO)    | kth (base)         | `kth` (main)         | shipped    |
| `https://hogia.findity.com/app/`            | findity            | `kth-findity`        | shipped    |
| `https://intra.kth.se/`                     | intra              | `kth-intra`          | shipped    |
| `https://agrprodweb01.ug.kth.se/agrprod/`   | efh (Inwise)       | `kth-efh`            | shipped    |
| `https://www.wisum.its.umu.se/KTH/`         | wisum              | `kth-wisum`          | shipped    |
| `https://canvas.kth.se/`                    | canvas (LMS)       | `kth-canvas`         | shipped    |
| `https://prisma.research.se/`               | prisma (VR)        | `kth-prisma`         | shipped    |

Update this table whenever a service skill is added.

## Adding a new KTH service

The end-to-end workflow lives in
`skills/kth-service-onboarding/SKILL.md` (meta-skill) and is
explained for humans in `README.md` § "Building a new skill".

Short version: open the service in the user's Chrome via the extension,
use `read_network_requests` + `javascript_tool` to discover endpoints,
write a `bin/kth-<service>` CLI + `skills/kth-<service>/SKILL.md`,
update this table.

## Install / first-run

```bash
cd kth-agent-skills
./install.sh                          # symlinks CLIs, seeds user config
$EDITOR ~/.config/kth-cli/config.env  # edit defaults (name, unit, address)
```

**Prerequisites:**
- **Claude Chrome extension** (`claude-in-chrome`) installed in the
  user's real Chrome. This is the only browser automation dependency.
- For KTH login: navigate to `https://www.kth.se/social/?login` in
  Chrome via the extension, complete MFA + tick "Keep me signed in".
- For Findity bearer: navigate to `https://hogia.findity.com/app/`,
  then intercept `window.fetch` via `javascript_tool` to capture the
  `Authorization: Bearer` header.

After setup, use skills via the agent or CLIs directly:
`kth-findity-upload --manifest <url> --bearer <token>`,
`kth-receipts costs openai-oeway --month 2026-04`, etc.

See `README.md` for the human-facing onboarding + the "build your own
skill" walkthrough.

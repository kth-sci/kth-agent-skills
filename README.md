# kth-agent-skills

Automate KTH IT services (expenses, invoices, purchasing, intranet,
Canvas, VR/Prisma grant applications) using AI agent skills and the
Claude Chrome extension. Originally built for Track C of the SCI
Agenthon 2026; maintained here as a standalone, installable collection.

> **⚠️ Disclaimer — please read before using**
>
> These skills are provided **for educational purposes only** as part of
> the SCI Agenthon 2026. They demonstrate how AI agents can interact
> with SAML-protected enterprise web services.
>
> - **KTH IT policy may not permit automation** of every service this
>   repo touches. Automating interactions with KTH systems may violate
>   institutional IT policies or individual service terms of use.
>   **Use is entirely at your own risk.**
> - **AI agents make mistakes.** Every action must be verified by a
>   human — especially anything irreversible (purchase orders, invoice
>   approvals, expense submissions).
> - The agent is designed to **never auto-submit money-moving actions**.
>   It prepares the form; you click the final button.
> - This project is **not affiliated with or endorsed by KTH IT**.
>   There is no warranty or support.

---

## Quick Start (5 minutes)

### 1. Install tools

- **Claude Code**: https://claude.ai/download
- **Claude Chrome extension**: https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome

### 2. Clone and enter the repo

```bash
git clone -b track-c git@github.com:kth-sci/sci-agenthon-2026.git
cd sci-agenthon-2026/Track_C
```

### 3. Start Claude with Chrome extension

```bash
claude --chrome
```

### 4. Paste this to your agent

Copy and paste the following into the Claude Code prompt:

```
Read the file AGENT_QUICKSTART.md in this directory. Follow the
first-time onboarding steps: run install.sh for me, ask me for my
KTH name and ID to set up the config, then help me log in to KTH
via Chrome and explore the available services.
```

**That's it.** The agent handles the rest — installs CLIs, asks for
your identity, writes the config, walks you through MFA login, and
shows what services are available.

---

## What you can do after setup

| Say this to the agent | What happens |
|----------------------|-------------|
| "Upload my receipts to Findity" | Uploads receipt PDFs, creates expense report with OCR |
| "Check my pending invoices" | Queries Unit4 EFH for tasks awaiting your approval |
| "Search WISUM for a monitor" | Searches KTH's purchasing catalog |
| "Order the cart Simin forwarded me" | Drives WISUM checkout to the final step (you click Submit) |
| "Read the latest news on the intranet" | Navigates intra.kth.se and extracts content |
| "Dump all material for my Canvas course to markdown" | Reads canvas.kth.se via its REST API and exports the course to a local markdown tree |
| "I want to automate some other KTH service" | Walks you through adding a new KTH service as a skill |

## What's in this repo

```
Track_C/
├── AGENT_QUICKSTART.md      ← The agent reads this to onboard you
├── CLAUDE.md                ← Architecture + operating principles
├── install.sh               ← Symlinks CLIs + skills, seeds config
├── bin/                     ← 9 CLIs (pure API, no browser dependency)
├── skills/                  ← 7 agent skills (Chrome extension based)
│   ├── kth/                 Login + SSO + routing
│   ├── kth-findity/         Travel expenses (Findity/Hogia)
│   ├── kth-efh/             E-invoices (Unit4 EFH)
│   ├── kth-wisum/           Purchasing (WISUM)
│   ├── kth-intra/           Intranet portal
│   ├── kth-canvas/          Canvas LMS (read + markdown dump)
│   └── kth-service-onboarding/  How to add new services
└── config/                  ← Config templates (your real config stays local)
```

## How it works

The agent uses a **discovery-then-script** methodology:

1. **Discovery** (first time): The agent uses the Chrome extension to
   screenshot pages, click around, and discover API endpoints. Slow but
   thorough.
2. **Script** (every time after): The agent injects JavaScript via the
   Chrome extension to call APIs directly — fast, no screenshots needed.
3. **CLI** (optional): Frequently-used API calls are wrapped in shell
   scripts for standalone use.

## Safety rules

- The agent **never auto-submits** purchase orders, invoice approvals,
  or expense report submissions. It prepares everything, then you click.
- Your config and credentials stay at `~/.config/kth-cli/` — never
  committed to git.
- KTH IT policy may not permit automation of every service. Use at your
  own risk. This repo is educational.

## Prerequisites

- A **KTH account** with Microsoft Authenticator MFA
- **Google Chrome** with the Claude extension installed
- **Python 3** + **curl** on PATH
- **Claude Code** started with `claude --chrome`

---

*Track C of the [SCI Agenthon 2026](https://github.com/kth-sci/sci-agenthon-2026)*

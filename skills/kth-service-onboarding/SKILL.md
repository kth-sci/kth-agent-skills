---
name: kth-service-onboarding
description: Discover and package a new KTH IT service as a reusable agent skill. Use when the user asks to automate a KTH service that does not yet have a `kth-<service>` skill — for example KTH Inwise (agrprodweb01.ug.kth.se), Canvas, Primula, Daisy, or any pasted KTH URL with no matching skill. This meta-skill walks the agent through opening the service via the Chrome extension, identifying its SAML round-trip, mapping its core verbs, capturing API endpoints, and writing a new `skills/kth-<service>/SKILL.md`. The output is a working per-service skill that the agent can use immediately afterwards.
compatibility: Requires the Claude Chrome extension (claude-in-chrome MCP server) and write access to the kth-agent-skills repo checkout.
metadata:
  kind: meta
---

# KTH service onboarding — meta-skill

You are creating a brand-new per-service skill for a KTH IT system that
isn't yet automated. The output of this skill is a new directory at
`skills/kth-<service>/` containing a
`SKILL.md` that any future agent can pick up.

## When to use this skill

- The user pastes a KTH service URL you don't recognise.
- The user asks for help with a system that isn't in the services roadmap
  table in the repo's `CLAUDE.md`.
- An existing per-service skill is too thin and needs more verbs mapped.

## Inputs you need from the user

Before you start, get these:

1. **Service start URL.** The page you'd land on after the SAML bounce.
2. **Short internal name** for the service. Lowercase, hyphen-separated,
   <=32 chars. Will become the skill directory name (`kth-<name>`).
3. **What does the user want to do with it?** The first one or two verbs.
   You don't need every feature on day one — ship a thin skill, iterate.

If the user pasted a URL but didn't pick a name, propose one based on the
hostname (e.g. `agrprodweb01.ug.kth.se/agrprod/` -> `kth-inwise` if it's the
Inwise system; ask the user to confirm).

## The discovery loop

### 1. Confirm KTH SSO is alive

Use the `kth` skill's status check: navigate to `https://intra.kth.se/`
and verify the user is logged in via `javascript_tool`. If not, go back
to the `kth` skill and complete login first.

### 2. Open the service URL in Chrome

Load the navigate tool and open the service:

```
ToolSearch  query="select:mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__read_network_requests,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__get_page_text"

navigate  to <service-start-url>
```

Watch the redirect chain by checking the current URL:

```
javascript_tool  run: location.href
```

- If it bounced through `login.kth.se` and landed on the service: the
  service uses standard KTH SAML. Great — this is the easy case.
- If it bounced through some *other* IdP (e.g. an Azure tenant): note
  that. The first login may need separate consent. Document it in the
  skill's `Prerequisites` section.
- If it errors out or hangs: take a screenshot with `computer` and
  report the situation to the user.

### 3. Read the post-login landing page

Use a combination of tools to understand the page:

```
read_page        (structured content — headings, links, forms)
get_page_text    (full visible text)
```

Note:
- The URL substring that indicates "we're logged in" (e.g. `/app/`,
  `/dashboard/`, the absence of `login`). This becomes the
  `landed_url_substring` metadata of the new skill.
- The top-level navigation entries — these are the verbs you'll map.

Check for token-bearing storage. SPAs often stash a JWT in `localStorage`:

```
javascript_tool  run:
  (function() {
    return {
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    };
  })()
```

If a likely token key shows up, pull its value and note it in the new
skill's "Bearer-token reuse" section (use the Findity skill as a
template).

### 4. Discover API endpoints via network inspection

This is the key discovery step. Use `read_network_requests` to capture
the API calls the service makes:

```
read_network_requests    (returns recent XHR/fetch calls with URLs, methods, status codes)
```

Then interact with the page — click through the main navigation, trigger
the verbs the user wants — and re-read network requests after each
action to see which endpoints are called:

```
javascript_tool  run:
  document.querySelector('a[href*="dashboard"]').click()

read_network_requests    (see what API calls that navigation triggered)
```

For each discovered endpoint, note:
- **URL pattern** (e.g. `/api/v1/reports?status=active`)
- **Method** (GET, POST, etc.)
- **Auth header** (Bearer token? Cookie-based? Both?)
- **Response shape** (JSON keys, pagination)

This replaces the old HAR-capture workflow. The Chrome extension's
network inspection gives you live visibility into every request the
service makes.

### 5. Probe endpoints with javascript_tool

Once you've identified API endpoints, verify they work by calling them
directly from the page context:

```
javascript_tool  run:
  (async function() {
    const resp = await fetch('/api/v1/reports?status=active', {
      credentials: 'include'
    });
    return { status: resp.status, data: await resp.json() };
  })()
```

This confirms the endpoint, auth model, and response shape without
leaving the browser.

### 6. Walk the user through one full task

Ask the user to describe their first real task end-to-end. Drive it
yourself using Chrome extension tools, narrating each step. Save the
resulting recipe — it becomes the first "Common verbs -> recipes" entry
in the new SKILL.md.

### 7. Write the new SKILL.md

Create `skills/kth-<name>/SKILL.md`
using the [template below](#skill-template). Validate against the
agentskills.io spec:

- `name` matches the directory name exactly.
- `name` is lowercase, hyphenated, <=64 chars, no leading/trailing/double
  hyphens.
- `description` is specific and keyword-rich, <=1024 chars, says both
  what the skill does AND when to use it.
- Body recommended <500 lines.

### 8. (Optional) Write a CLI wrapper for pure-API operations

If the service exposes clean JSON APIs (discovered in steps 4-5), write
a `bin/kth-<name>` shell script that hits those endpoints with `curl`.
This is for read-only operations that don't need a browser. The CLI
wrapper should:

- Source `~/.config/kth-cli/config.env` for user-specific defaults.
- Accept a bearer token (if applicable) from the caller or capture it
  from Chrome via `javascript_tool` on first use.
- Provide subcommands for each read-only verb.

### 9. Update the project roadmap

Edit the services table in `CLAUDE.md`
to add the new row with status `shipped`.

### 10. Tell the user

Briefly: "I created `skills/kth-<name>/`. You can use it now for `<verbs>`.
To make it visible to other Claude Code sessions, re-run `./install.sh`
(or symlink it into `~/.claude/skills/`)."

## SKILL template

Copy this and fill in the bracketed fields. Keep the structure — other
skills are written to the same shape so agents can scan them quickly.

```markdown
---
name: kth-<name>
description: <1-2 sentence "what + when to use" — include service name, common
synonyms, the start URL host, and Swedish + English keywords the user might
use. Max 1024 chars.>
compatibility: Requires the Claude Chrome extension (claude-in-chrome MCP
server). SSO must be valid (verified via the `kth` skill's status check).
metadata:
  service: <name>
  start_url: <service-start-url>
  landed_url_substring: <URL fragment indicating logged-in state>
---

# <Service display name> — service skill

<One paragraph describing what the service is, why an agent would use it,
and any unusual auth properties.>

## Prerequisites
1. Main `kth` skill must have confirmed SSO session is alive.
2. <Anything service-specific, e.g. an extra consent screen on first run.>

## Tool loading

Before using any Chrome extension tools, load their schemas:
\`\`\`
ToolSearch  query="select:mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_page"
\`\`\`

## Open the service
\`\`\`
navigate  to <start-url>
javascript_tool  run: location.href   // verify we landed correctly
\`\`\`

## Common verbs -> recipes

### "<First verb>"
1. <Step-by-step Chrome extension tool calls.>
2. ...

### "<Second verb>"
1. ...

## Session-expiry detection
If navigating to `<start-url>` lands on `login.kth.se` (check
`location.href` via `javascript_tool`), stop and tell the user their
session has expired. Go back to the `kth` skill to re-authenticate.

## What this skill should never do
- <Service-specific guard rails, e.g. "Never submit a form that emails
  the head of department.">
```

## Naming conventions

- Skill directory & `name` field: `kth-<short-name>`, lowercase-hyphen.
- Internal `service` metadata: the same short name without the `kth-`
  prefix.
- The service short name should be the user-recognisable label, not the
  hostname. Examples:
  - `agrprodweb01.ug.kth.se/agrprod/` -> `kth-inwise` (it IS the Inwise
    system; confirm with user)
  - `hogia.findity.com/app/` -> `kth-findity`
  - `intra.kth.se` -> `kth-intra`

## Sanity checks before declaring the skill done

- `cat skills/kth-<name>/SKILL.md | head -20` — frontmatter parses, the
  `name` field equals the directory name.
- Run one full end-to-end task using only the new skill's recipes (no
  improvising) to make sure the steps are accurate.
- The new row in `CLAUDE.md`'s services table is committed alongside.

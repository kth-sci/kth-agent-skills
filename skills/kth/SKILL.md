---
name: kth
description: Operate any KTH (Royal Institute of Technology, Stockholm) IT service via the Claude Chrome extension (claude-in-chrome MCP). Use whenever the user asks about KTH systems, logging in to KTH, completing the KTH single sign-on or Microsoft Authenticator step, checking session status, or routing a task to a specific KTH service (Findity / travel expenses, intra.kth.se, Inwise, Canvas, etc.). This is the main entry skill — load it first for any KTH task and it will tell you which per-service skill (kth-findity, kth-intra, ...) to load next.
license: Proprietary — internal automation for one user
compatibility: Requires the Claude Chrome extension (claude-in-chrome MCP server) connected to the user's Chrome browser. Designed for Claude Code on macOS / Linux.
metadata:
  repo: kth-agent-skills
  service: kth-base-sso
  start_url: https://www.kth.se/social/?login
---

# KTH — main entry skill

You are operating the user's Chrome browser via the Claude Chrome
extension (`mcp__claude-in-chrome__*` MCP tools). The user's Chrome
holds the KTH single-sign-on cookie. Once the user has completed the
Microsoft Authenticator push **once**, every downstream KTH service
federates silently through the same browser session.

The Chrome extension IS the browser interface — there is no separate
`bin/kth` wrapper or daemon to manage.

## Tool loading prerequisite

All `mcp__claude-in-chrome__*` tools are deferred. Before calling any
of them, load their schema with `ToolSearch`:

```
ToolSearch  query="select:mcp__claude-in-chrome__navigate"
```

Load each tool you need before first use. The most commonly used tools
for KTH tasks:

| Tool                                          | Purpose                           |
| --------------------------------------------- | --------------------------------- |
| `mcp__claude-in-chrome__navigate`             | Open a URL in Chrome              |
| `mcp__claude-in-chrome__read_page`            | Get page content (a11y tree)      |
| `mcp__claude-in-chrome__javascript_tool`      | Run JS on the page                |
| `mcp__claude-in-chrome__computer`             | Screenshot + click (for MFA UI)   |
| `mcp__claude-in-chrome__get_page_text`        | Get visible text content          |
| `mcp__claude-in-chrome__read_network_requests`| Inspect network calls             |
| `mcp__claude-in-chrome__find`                 | Find elements on the page         |
| `mcp__claude-in-chrome__form_input`           | Fill form fields                  |
| `mcp__claude-in-chrome__tabs_context_mcp`     | Get current tab info              |

## When to use this skill

Activate this skill first for ANY task involving KTH systems. From here,
decide which per-service skill to load next.

Examples that should land here first:
- "List my travel expenses." -> load `kth-findity` after confirming auth.
- "Open the KTH intranet and find the announcement about X." -> load `kth-intra`.
- "I need to look at something in the Inwise system." -> ask for the URL and
  invoke `kth-service-onboarding` if no skill exists yet.
- "Am I still logged in to KTH?" -> handle here with the status check.

## The exact flow for any KTH task

### 1. Check the session

Navigate to `https://intra.kth.se/` and check whether the user is
already logged in:

```
navigate  to https://intra.kth.se/
javascript_tool  run:
  (function() {
    const links = document.querySelectorAll('a');
    for (const a of links) {
      if (/logga in|log in|sign in/i.test(a.textContent)) {
        return { loggedIn: false, hint: a.textContent.trim() };
      }
    }
    return { loggedIn: true, url: location.href };
  })()
```

If `loggedIn` is `true`, skip to step 3.

### 2. Bootstrap login if needed

Tell the user a browser tab will open and they must complete Microsoft
Authenticator.

```
navigate  to https://www.kth.se/social/?login
```

The page will redirect through `login.kth.se` / `login.microsoftonline.com`.
The user enters username + password + approves the Authenticator push on
their phone. Do NOT attempt to automate the MFA push.

After the user confirms they have logged in, use `computer` to check for
the "Keep me signed in" / "Stay signed in?" prompt and tick it:

```
computer   take a screenshot to check for "Stay signed in?" dialog
computer   if visible, click "Yes" to extend the session to ~7 days
```

Then verify the session is alive by repeating the status check from
step 1.

### 3. Load the per-service skill

Match the user's task to the right sub-skill (see
[Service routing](#service-routing) below) and follow that skill's
instructions.

### 4. If no per-service skill exists

Load `kth-service-onboarding` and follow it to discover the new service.

## Service routing

| User intent keywords                              | Skill to load              |
| ------------------------------------------------- | -------------------------- |
| travel, expense, reserakning, Findity, Hogia      | `kth-findity`              |
| intranet, intra, announcements, internal news     | `kth-intra`                |
| invoice, faktura, attest, EFH, Inwise, Unit4      | `kth-efh`                  |
| purchasing, order, WISUM, bestalla, varukorg      | `kth-wisum`                |
| Canvas, canvas.kth.se, LMS, course material, kursrum, a `/courses/<id>` URL | `kth-canvas` |
| Prisma, VR, Vetenskapsrådet, grant application, research council, `prisma.research.se` | `kth-prisma` |
| agrprod, Inwise (specific URL: `agrprodweb01.ug.kth.se/agrprod/`) | `kth-efh`  |
| any other KTH service URL the user pastes         | `kth-service-onboarding`   |

When in doubt, ask the user for the exact service URL and then either
match it to a known skill or fall through to onboarding.

## Recognising session expiry mid-flow

If navigating to a KTH service URL lands on `login.kth.se` or
`login.microsoftonline.com` (check with `javascript_tool` reading
`location.href`), the SSO cookie has expired. Pause the task, tell the
user they need to log in again, navigate to the SSO trigger, and wait
for the user to confirm they completed MFA.

## Conventions every per-service skill should follow

- Use `mcp__claude-in-chrome__navigate` to open service URLs.
- Use `mcp__claude-in-chrome__javascript_tool` for fast, scriptable
  interactions (reading page data, filling forms, clicking buttons).
- Use `mcp__claude-in-chrome__computer` (screenshot + click) only when
  you need visual confirmation or are dealing with elements that are
  hard to target via JS (e.g., the MFA dialog, complex canvas UIs).
- Use `mcp__claude-in-chrome__read_page` to get a structured view of
  page content.
- After completing the task, do NOT sign the user out. The session is
  shared with every other KTH skill.
- For pure API operations (JSON endpoints discovered during onboarding),
  write CLI wrappers in `bin/` that use `curl` with cookies extracted
  from the browser.

## What to absolutely never do

- Never try to type a TOTP code or simulate the Authenticator push. The
  user's phone is the second factor, full stop.
- Never sign the user out of any KTH service.
- Never commit browser cookies, session tokens, or user config files.

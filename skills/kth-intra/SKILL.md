---
name: kth-intra
description: Navigate the KTH intranet portal at https://intra.kth.se/ via the Claude Chrome extension (claude-in-chrome MCP). Use when the user wants to access internal announcements, employee news, HR information, the services menu at intra.kth.se, or any page on the intra.kth.se domain. The intranet is the gateway to most KTH employee-facing services — use this skill to locate a service in the menu before deciding whether a more specific skill (e.g. kth-findity) exists for it. Prerequisite: load the main `kth` skill first to confirm SSO.
compatibility: Requires the Claude Chrome extension (claude-in-chrome MCP server). SSO must be valid (verified via the `kth` skill's status check).
metadata:
  service: intra
  start_url: https://intra.kth.se/
  landed_url_substring: intra.kth.se
---

# KTH intranet portal — service skill

`intra.kth.se` is the employee-facing portal. Once authenticated through
`login.kth.se`, it serves as a navigation hub: news, announcements, HR
links, and a **services menu** that links out to every other internal
system (Findity, Inwise, Canvas, Primula, etc.).

This skill is the right entry point for two kinds of user task:

1. **Reading something on the intranet itself** (news, announcement,
   policy page, calendar).
2. **Discovering which other KTH service to use** for a task. The services
   menu on intra is the canonical list.

## Prerequisites

The main `kth` skill must have already confirmed the SSO session is
alive (via the login status check). If not, go back to the `kth` skill
and complete login first.

## Tool loading

Before using any Chrome extension tools, load their schemas:

```
ToolSearch  query="select:mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__find,mcp__claude-in-chrome__form_input"
```

## Open the portal

```
navigate  to https://intra.kth.se/
```

Then read the page content to understand the current state:

```
read_page   (returns structured page content with navigation, headings, links)
```

Or for more targeted extraction, use `javascript_tool`:

```
javascript_tool  run:
  (function() {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .map(h => h.textContent.trim());
    const navLinks = Array.from(document.querySelectorAll('nav a'))
      .map(a => ({ text: a.textContent.trim(), href: a.href }));
    return { headings, navLinks };
  })()
```

## Common verbs -> recipes

### "Show me today's announcements / news"

1. Navigate to `https://intra.kth.se/`.
2. Use `javascript_tool` to extract news items:
   ```
   javascript_tool  run:
     (function() {
       // Look for news/announcement sections
       const articles = document.querySelectorAll('article, .news-item, [class*="news"], [class*="announcement"]');
       if (articles.length > 0) {
         return Array.from(articles).slice(0, 10).map(a => ({
           title: (a.querySelector('h2, h3, h4') || {}).textContent?.trim(),
           date: (a.querySelector('time, .date, [class*="date"]') || {}).textContent?.trim(),
           summary: (a.querySelector('p') || {}).textContent?.trim(),
           link: (a.querySelector('a') || {}).href
         }));
       }
       // Fallback: get page text
       return { fallback: true, text: document.body.innerText.substring(0, 3000) };
     })()
   ```
3. If the user asks for the full body of a specific article, navigate to
   its link and use `get_page_text` to read the content.

### "Open service X from the intranet"

1. Navigate to `https://intra.kth.se/`.
2. Use `javascript_tool` to find the services menu and extract all links:
   ```
   javascript_tool  run:
     (function() {
       const allLinks = Array.from(document.querySelectorAll('a'));
       const serviceLinks = allLinks.filter(a =>
         /tjanst|service|system|verktyg|tool/i.test(a.textContent) ||
         /tjanst|service/i.test(a.href)
       );
       return serviceLinks.map(a => ({ text: a.textContent.trim(), href: a.href }));
     })()
   ```
3. Find the matching service, then either:
   - Navigate directly to its URL if found.
   - Hand off to the dedicated skill if one exists.
   - Load `kth-service-onboarding` if no skill exists for it.

### "Find <topic> on the intranet"

1. Navigate to `https://intra.kth.se/`.
2. Use `find` to locate the search box and `form_input` to fill it:
   ```
   find         search for the search input field
   form_input   fill the search field with "<topic>"
   ```
   Or use `javascript_tool` to find and submit the search:
   ```
   javascript_tool  run:
     (function() {
       const input = document.querySelector('input[type="search"], input[name*="search"], input[placeholder*="Sok"], input[placeholder*="Search"]');
       if (input) {
         input.value = '<topic>';
         input.dispatchEvent(new Event('input', { bubbles: true }));
         const form = input.closest('form');
         if (form) form.submit();
         return { submitted: true };
       }
       return { error: 'Search input not found' };
     })()
   ```
3. After the results page loads, use `get_page_text` or `javascript_tool`
   to read the search results.

## Session-expiry detection

If navigating to `https://intra.kth.se/` lands on `login.kth.se` or
`login.microsoftonline.com` (check `location.href` via `javascript_tool`),
stop and tell the user their session has expired. Go back to the `kth`
skill to re-authenticate.

## Language

The intranet defaults to Swedish for most users. If the page text is
Swedish, do not force English — match against both. Common pairs:

| Swedish        | English       |
| -------------- | ------------- |
| Tjanster       | Services      |
| Nyheter        | News          |
| Sok            | Search        |
| Logga ut       | Sign out      |
| Reserakning    | Expense report |

## What this skill should never do

- Sign the user out of the intranet (don't click "Logga ut" / "Sign out").
- Submit any form on the user's behalf without explicit confirmation —
  intranet forms can fire off HR requests, leave applications, etc.

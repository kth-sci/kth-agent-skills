---
name: kth-canvas
description: Read and export content from KTH Canvas (https://canvas.kth.se), the Instructure-based learning-management system, via the `kth canvas` CLI. Use when the user wants to list their Canvas courses, inspect a course's modules / pages / assignments / announcements / files, see the class roster, check their grading queue / what needs grading, view per-assignment submission status (who has / hasn't handed in), dump an entire course to local Markdown, or asks about "Canvas", "canvas.kth.se", "LMS", "course material", "kursrum", a Canvas course URL like https://canvas.kth.se/courses/63758, or wants a Canvas API access token captured. Backed by the Canvas REST API (https://canvas.kth.se/api/v1) with a personal Bearer access token; reads are pure curl. Prerequisite: load the main `kth` skill first only if you also need an interactive SSO session — Canvas reads themselves need only the token.
license: Proprietary — internal automation for one user
compatibility: Reads use a personal Canvas access token (pure curl, no browser at runtime). Capturing the token uses the Claude Chrome extension (claude-in-chrome MCP) once, at https://canvas.kth.se/profile/settings. Designed for Claude Code on macOS / Linux.
metadata:
  service: canvas
  vendor: Instructure (Canvas LMS)
  start_url: https://canvas.kth.se
  settings_url: https://canvas.kth.se/profile/settings
  api_base: https://canvas.kth.se/api/v1
  reference: https://github.com/KTH/canvas-api
---

# KTH Canvas — service skill

KTH's learning-management system is a standard Instructure **Canvas LMS**
instance at `https://canvas.kth.se`, with a clean, well-documented REST
API at `https://canvas.kth.se/api/v1`. The KTH-maintained client library
[`@kth/canvas-api`](https://github.com/KTH/canvas-api) is the reference
for the endpoint shapes; this skill talks to the same API with pure curl
through the `kth canvas` CLI.

## Architecture

| Phase | How |
| ----- | --- |
| **Token capture (one-time)** | Canvas auth is NOT the SAML cookie. It's a personal **access token** minted from `https://canvas.kth.se/profile/settings`. The token is shown exactly once, in the "Access Token Details" dialog right after the user clicks **Generate Token**. The Claude Chrome extension reads it from the DOM and `kth canvas token --set <token>` stores it (mode 0600). |
| **Reads (every use)** | `kth canvas courses / modules / pages / assignments / files / dump …` run pure curl with the stored Bearer token. No browser at runtime — cron-friendly. Pagination follows the `Link: rel="next"` header automatically. |
| **Writes** | Out of scope. Posting grades, submitting, deleting, editing pages mutate teaching state — those stay in the browser with the user clicking the final button (see [[feedback-irreversible-writes-stay-in-browser]]). |

Unlike the cookie-based KTH services (EFH, WISUM, intra), Canvas does not
need a warm SSO session at runtime — the token *is* the credential. You
only need the browser the first time, to mint and capture the token.

## Token capture recipe (Chrome extension)

Tokens are sensitive credentials. **Generating a token is a write action**
— let the user click **Generate Token** themselves; the agent only reads
the resulting value from the page. Never click "Delete" / "Regenerate" on
an existing integration without the user asking.

All `mcp__claude-in-chrome__*` tools are deferred — load each with
`ToolSearch query="select:mcp__claude-in-chrome__<tool>"` before first use.

> **Verified 2026-06-08 on the live KTH Canvas (Swedish InstUI UI).** The
> KTH instance renders in Swedish: the button is **"Ny åtkomsttoken"**, the
> purpose field is **"Ändamål"**, and the generate button is **"Generera
> token"**. Selectors/labels below reflect that real UI.

1. **Open the settings page** (the KTH SSO cookie federates Canvas silently
   if the user is logged in; if it lands on `login.kth.se`, load the main
   `kth` skill and complete MFA first):
   ```
   navigate  to https://canvas.kth.se/profile/settings
   ```
2. **Open the New-Token dialog and pre-fill the purpose** for the user (this
   just opens a modal — not the credential-minting step). The button has a
   stable class `.add_access_token_link`; the purpose field is the only
   visible text input in the modal. React needs the native value setter:
   ```js
   (function () {
     document.querySelector('.add_access_token_link')?.click();
     return new Promise(res => setTimeout(() => {
       const modal = document.querySelector('form[class*="modal"], [role="dialog"]');
       const inp = [...(modal || document).querySelectorAll('input[type=text]')]
         .find(i => i.offsetParent !== null);   // the "Ändamål" field
       if (!inp) return res('no purpose field');
       const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
       set.call(inp, 'kth-canvas CLI');
       inp.dispatchEvent(new Event('input', {bubbles:true}));
       inp.dispatchEvent(new Event('change', {bubbles:true}));
       res('purpose filled');
     }, 600));
   })()
   ```
   Leave **Utgångsdatum/Utgångstid** (expiry) blank for a non-expiring token.
3. **Let the USER click "Generera token".** Minting a credential is the
   user's action — never click it for them. The token string appears once,
   in the dialog's details view.
4. **Read the token immediately** (before the dialog is dismissed — Canvas
   shows it only once). The reliable capture is a regex over the visible
   dialog text; KTH Canvas tokens look like `NNNN~<base64ish>` (~65 chars):
   ```js
   (function () {
     // Try known detail selectors first, then fall back to the shape regex.
     for (const s of ['.access_token .visible_token','#visible_token','.text_token','.access_token_value']) {
       const el = document.querySelector(s);
       if (el && el.textContent.trim().length > 20) return el.textContent.trim();
     }
     const m = document.body.innerText.match(/\b\d{3,5}~[A-Za-z0-9]{40,}\b/);
     return m ? m[0] : null;
   })()
   ```
   If it returns `null`, the dialog already closed — ask the user to
   generate a fresh one (or to paste the value they can still see). The
   token is shown exactly once; there is no way to re-read an old one.
5. **Store it** (do not echo it back in a shared session):
   ```bash
   kth canvas token --set '<the-token>'
   ```
   This writes `~/.config/kth-cli/.canvas-token` (mode 0600). Alternatively
   the user sets `KTH_CANVAS_TOKEN` in `~/.config/kth-cli/secrets.env`.
6. **Verify**:
   ```bash
   kth canvas whoami      # GET /users/self → {"name": "...", "login_id": "..."}
   ```

## Verbs

### "Which Canvas courses am I in?"
```bash
kth canvas courses           # active enrolments
kth canvas courses --all     # every state (past, completed, invited)
```
Each entry has `id`, `name`, `course_code`, `term`. The `id` is what every
other verb takes.

### "Show me the structure of course 63758"
```bash
kth canvas course 63758         # metadata + syllabus_body
kth canvas modules 63758        # modules with their items (pages, assignments, files…)
kth canvas pages 63758          # wiki-page index
kth canvas assignments 63758    # assignments with due dates + points
kth canvas announcements 63758  # announcements
kth canvas files 63758          # file manifest with download URLs
kth canvas syllabus 63758       # raw syllabus_body HTML
```

### "Read one wiki page"
```bash
kth canvas page 63758 <page-url>     # page-url is the slug from `pages`, e.g. "lecture-1"
```

### Teaching views — the people and work in a course (read-only)
These cover the day-to-day teacher questions that go beyond course content.
```bash
# People & grades
kth canvas roster 63758              # students with name + email
kth canvas roster 63758 --teachers   # co-teachers / examiners (also --tas, --role <t>)
kth canvas grades 63758              # class grade overview (current/final score per student)
kth canvas student 63758 141366      # one student's enrolment + grade
kth canvas sections 63758            # sections + student counts
kth canvas groups 63758              # student groups / project teams

# Grading queue & submissions
kth canvas todo                      # your grading queue across ALL courses
kth canvas todo 63758                # grading queue for one course
kth canvas gradebook 63758           # per-assignment: due date, points, # needing grading
kth canvas submissions 63758 381751  # per-student status for one assignment

# Course structure
kth canvas assignment 63758 381751   # full detail of one assignment
kth canvas quizzes 63758             # quizzes; quiz 63758 <quizId> for one
kth canvas discussions 63758         # discussion topics
kth canvas discussion 63758 553676   # one full thread incl. every reply
kth canvas calendar 63758            # scheduled events for the course

# Inbox (Canvas Conversations — read-only)
kth canvas inbox                     # your message threads
kth canvas message 1578956           # one conversation incl. all messages
```
- **`todo`** answers "what needs my attention?" — each item carries
  `needs_grading_count`, the assignment, and the course. The fastest
  cross-course triage a teacher has.
- **`gradebook`** is the assignment dashboard; **`grades`** is the student
  dashboard (one score per learner). Combine `gradebook` with `roster` to see
  who is missing, or `submissions <assignmentId>` to drill into one task.
- **`submissions`** rows carry `workflow_state` (`unsubmitted` / `submitted` /
  `graded`), `submitted_at`, `late`, `missing`, `score`, and the inline `user`
  — enough to answer "who hasn't handed in X?" without opening Canvas.
- **`discussion`** returns the `/view` payload — the topic plus every threaded
  reply — so the agent can read what students actually posted.
- **`inbox` / `message`** are read-only views of Canvas Conversations.
  *Sending* a message is an outward-facing action: the agent drafts it, the
  user sends it in the browser.

### What the AI adds on top of these reads
The reads above are the raw material; the agent's value is reasoning over them:
- **"Summarise / ask questions about my course"** → `kth canvas dump <id>` to
  Markdown, then the agent reads and answers (course outline, what's due when,
  find a topic across pages).
- **"Draft an announcement / a reminder email to students who haven't
  submitted"** → the agent drafts the text from `submissions` + `roster`; the
  **user posts it in the browser**. Composing is fine; the final send/publish
  is the irreversible step and stays a human click (see below).

### "Run an endpoint I don't have a verb for"
```bash
kth canvas raw '/courses/63758/quizzes'
kth canvas raw '/courses/63758/users?enrollment_type[]=teacher' --paginate
```
`--paginate` follows `Link: rel="next"` and merges all pages into one JSON
array. Without it, you get a single page (max 100 with `per_page`).

### "Pull all material for a course as local Markdown" ← main export
```bash
kth canvas dump 63758                       # → ./canvas-dump/course-63758/
kth canvas dump 63758 --out ~/courses/dd2421 # custom output dir
```
Walks the whole course and writes a Markdown tree:
```
course-63758/
  README.md          course meta + index of the dump
  syllabus.md        syllabus (HTML → Markdown)
  front-page.md      course front page, if set
  pages/*.md         every wiki page (body fetched individually)
  modules/*.md       one file per module; items link to Canvas
  modules/README.md  module index
  assignments/*.md   one file per assignment + README index
  announcements/*.md
  files.md           manifest of all files with download URLs
```
HTML bodies are converted to Markdown by a dependency-free converter
(headings, links, lists, emphasis, images, code, tables). File *contents*
are not downloaded — `files.md` lists token-scoped Canvas download URLs;
fetch them with `curl -H "Authorization: Bearer $(kth canvas token)" <url>`
if the user wants the actual PDFs.

## Discovered API surface

| Endpoint | Used by |
| -------- | ------- |
| `GET /users/self` | `whoami` |
| `GET /courses?enrollment_state=active` | `courses` |
| `GET /courses/:id?include[]=syllabus_body&include[]=term` | `course`, `syllabus` |
| `GET /courses/:id/modules?include[]=items&include[]=content_details` | `modules`, `dump` |
| `GET /courses/:id/pages` + `GET /courses/:id/pages/:url` | `pages`, `page`, `dump` |
| `GET /courses/:id/assignments` | `assignments`, `dump` |
| `GET /courses/:id/discussion_topics?only_announcements=true` | `announcements`, `dump` |
| `GET /courses/:id/files` | `files`, `dump` |
| `GET /courses/:id/users?enrollment_type[]=…&include[]=email&include[]=enrollments` | `roster`, `students` |
| `GET /users/self/todo` · `GET /courses/:id/todo` | `todo` |
| `GET /courses/:id/assignments?include[]=needs_grading_count&include[]=all_dates` | `gradebook` |
| `GET /courses/:id/assignments/:aid/submissions?include[]=user` | `submissions` |
| `GET /courses/:id/enrollments?type[]=StudentEnrollment&include[]=grades` | `grades`, `student` |
| `GET /courses/:id/sections?include[]=total_students` | `sections` |
| `GET /courses/:id/groups?include[]=group_category` | `groups` |
| `GET /courses/:id/assignments/:aid?include[]=overrides` | `assignment` |
| `GET /courses/:id/quizzes` · `GET /courses/:id/quizzes/:qid` | `quizzes`, `quiz` |
| `GET /courses/:id/discussion_topics` · `…/:tid/view` | `discussions`, `discussion` |
| `GET /calendar_events?context_codes[]=course_:id` | `calendar` |
| `GET /conversations` · `GET /conversations/:id` | `inbox`, `message` |

`dump` additionally pulls discussion topics and the quiz index alongside
pages/modules/assignments/announcements/files.

Not exposed (KTH disables it): `…/analytics/student_summaries` returns 404 on
this instance — analytics is off. Use `grades` + `submissions` instead.

All require `Authorization: Bearer <token>`. Canvas paginates with the
`Link` header (`rel="next"`), max `per_page=100`.

## What this skill should never do

- **Mint, regenerate, or delete tokens on the user's behalf.** The agent
  reads a token the *user* generated; it never clicks Generate/Delete.
- **Write to Canvas** — no grade posting, submitting, page editing, or
  deletion via the API. Those are irreversible teaching actions and stay
  in the browser. See [[feedback-irreversible-writes-stay-in-browser]].
- **Print the token** in a shared session (`kth canvas token` exists for
  ad-hoc curl, not casual sharing) or **commit** `~/.config/kth-cli/.canvas-token`.

## Notes / gotchas

- A token created without an expiry is long-lived; treat it like a
  password. If `whoami` returns 401, the token was revoked or expired —
  re-run the capture recipe.
- Some courses restrict the `pages`/`files` endpoints to teachers; a 403
  on one sub-resource is non-fatal — `dump` skips it and continues (you'll
  see the section missing from the output rather than an abort).
- `dump` fetches each wiki page body in its own request; large courses take
  a little while. There's no Canvas-side rate limit issue at this volume,
  but the CLI is sequential by design (simple + reliable).

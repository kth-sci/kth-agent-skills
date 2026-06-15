# Canvas AI Agent — 3-minute teachers'-meeting demo

**Goal:** show colleagues that you can ask an AI agent, in plain English, about
your own Canvas teaching — and that it's safe (read-only; you click anything
irreversible).

**Setup before the room:**
- Open `slide.html` full-screen on the projector (it's one self-contained slide).
- Have a terminal ready in `kth-agent-skills/` *and* a Claude Code / agent
  session ready (the agent is what you actually talk to — the CLI below is
  what it runs under the hood, handy as a fallback).
- Token already stored (`kth canvas whoami` confirms it). No login on stage.

Demo course: **SI1410 HT26 — Basic Modeling in Biotechnology** (id `63758`),
where you're a Teacher with 6 enrolled students.

---

## The 3 minutes

### 0:00 — Hook (20s)
> "We all spend time clicking through Canvas. I'm going to *ask* Canvas
> instead. Same login, same permissions as me — but in plain English, through
> an AI agent. Nothing here is a mock-up; this is my live Canvas right now."

*(Slide is up. Point at the terminal panel.)*

### 0:20 — "What do I need to grade?" (40s)  ← the wow moment
Ask the agent:
> **"What do I need to grade across all my courses?"**

Under the hood it runs:
```bash
kth canvas todo
```
Expected: a cross-course grading queue — e.g. **59 submissions** waiting in
*BB103X*, plus items in *SK2538*. Say:
> "One question, every course at once. Canvas can't show me that on one screen
> — the agent just did."

### 1:00 — "Who's in my course?" + draft (45s)
> **"Who's enrolled in SI1410 HT26, and draft a short welcome announcement?"**

Under the hood:
```bash
kth canvas roster 63758          # 6 students, names + @kth.se emails
```
The agent lists the 6 students and **drafts** a welcome announcement.
Then deliver the safety message (point at the 🛡️ badge on the slide):
> "Notice what it did *not* do — it didn't post it. The agent drafts; **I**
> press publish. Posting, grading, emailing — every irreversible action stays
> a human click in my browser. My password and MFA never touch the agent."

### 1:45 — "Ask anything about the course" (50s)
> **"Summarise SI1410, what's due in the first two weeks, and what are
> students asking about in the discussion forum?"**

Under the hood:
```bash
kth canvas gradebook 63758       # assignments + due dates + points
kth canvas dump 63758 --out /tmp/si1410   # whole kursrum → Markdown (103 pages,
                                          # modules, assignments, 7 discussions)
```
Expected: weekly quizzes with due dates (Quiz Week 1 due 2026-08-28, …) and a
read of the discussion threads. Say:
> "It read the *entire* course — 103 pages, every assignment, the discussion
> forum — and answered. That dumped Markdown is the AI's fuel: now I can ask
> it to find a topic, check for overlaps between weeks, or draft a study guide."

### 2:35 — Wrap (25s)
> "Three things to take away: it's **read-only and safe** — irreversible
> actions are mine to click. It works on **your** courses with **your**
> login. And it's not a product — it's an open **skill**, a recipe you can
> read, trust, and adapt for your own teaching. Happy to share it."

*(Back to slide; point at the five 'Why teachers care' points.)*

---

## Live commands cheat-sheet (fallback / for the curious)
```bash
# Identity & courses
kth canvas whoami                    # prove it's my real account
kth canvas courses                   # everything I teach/take
# People & grades
kth canvas roster 63758              # students + emails
kth canvas roster 63758 --teachers   # co-teachers / examiners
kth canvas grades 63758              # class grade overview
kth canvas student 63758 141366      # one student's grade
kth canvas sections 63758            # sections + counts
kth canvas groups 63758              # project groups
# Grading queue
kth canvas todo                      # grading queue, ALL courses
kth canvas gradebook 63758           # per-assignment: due / points / needs-grading
kth canvas submissions 63758 381751  # who handed in Quiz Week 1
# Course content
kth canvas assignment 63758 381751   # one assignment in full
kth canvas quizzes 63758             # quizzes
kth canvas discussions 63758         # discussion topics
kth canvas discussion 63758 553676   # one full thread w/ replies
kth canvas calendar 63758            # scheduled events
# Inbox (read-only)
kth canvas inbox                     # message threads
kth canvas message 1578956           # one conversation
# Export for the AI
kth canvas dump 63758 --out /tmp/si1410   # whole course → Markdown
```

## If asked…
- **"Can it change grades / post for me?"** No. Reads are automated; every
  write is drafted and left for you to click in the browser. That's a design
  rule of the whole `kth-agent-skills` project, not a missing feature.
- **"How does it log in?"** A personal Canvas access token I minted once from
  my profile settings (stored locally, 0600). No password sharing.
- **"Is this allowed?"** It uses Canvas's own public REST API with my own
  permissions. Treat institutional automation policy as you would any script —
  check with KTH IT if unsure. (See the project disclaimer.)
- **"Does it see other teachers' courses?"** Only what my account can already
  see. Same permissions, faster access.

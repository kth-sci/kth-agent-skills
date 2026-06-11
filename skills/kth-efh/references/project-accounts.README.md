# Where the project-accounts file lives

`kth efh summary` reads project-routing rules from **the user-config
directory**, not from this repo. The expected paths (in order):

1. `$KTH_EFH_PROJECT_ACCOUNTS` (env override)
2. `~/.config/kth-cli/project-accounts.yaml`
3. `~/.claude/skills/kth-efh/references/project-accounts.yaml` (legacy)
4. `<repo>/skills/kth-efh/references/project-accounts.yaml` (legacy)

If none exist, `kth efh summary` still works — it just won't propose a
project; the user can see the invoice details and decide themselves.

## Setting up your own routing

The repo ships a template at:

  `<repo>/config/project-accounts.example.yaml`

Copy it to `~/.config/kth-cli/project-accounts.yaml` and edit the
rules to match the projects you can charge.

## Schema

See the example file for the full schema. Briefly:

```yaml
version: 1
owner: "Your Name (KTHID)"

rules:
  - id: short-rule-id
    when: "When does this rule apply, in prose?"
    project: "12345"          # the Unit4 project number
    cost_centre: "SCI-XYZ"
    label: "Human-readable label"
    keywords: [list, of, lowercase, strings, matched, against, invoice, text]
  ...

default:
  project: "..."
  label: "..."
  rationale: "Fallback when no rule matched."
```

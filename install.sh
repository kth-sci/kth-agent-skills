#!/usr/bin/env bash
# Install kth-agent-skills: symlink CLIs + skills and seed user config from templates.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_BIN="${LOCAL_BIN:-$HOME/.local/bin}"
CLAUDE_SKILLS="${CLAUDE_SKILLS:-$HOME/.claude/skills}"

say() { printf '[install] %s\n' "$*"; }

# 1) CLI symlinks (any executable in bin/)
mkdir -p "$LOCAL_BIN"
if [ -d "$REPO_DIR/bin" ]; then
  for f in "$REPO_DIR"/bin/*; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"
    chmod +x "$f"
    ln -sfn "$f" "$LOCAL_BIN/$name"
    say "Linked $name → $LOCAL_BIN/$name"
  done
fi
case ":$PATH:" in
  *":$LOCAL_BIN:"*) ;;
  *) say "WARNING: $LOCAL_BIN is not on \$PATH. Add it to your shell rc." ;;
esac

# 2) Seed user config from templates on first run.
#    User-specific preferences live OUTSIDE the repo at ~/.config/kth-cli/.
#    We never overwrite an existing config.
USER_CONFIG_DIR="$HOME/.config/kth-cli"
mkdir -p "$USER_CONFIG_DIR"
if [ ! -f "$USER_CONFIG_DIR/config.env" ] && [ -f "$REPO_DIR/config/kth-cli.example.env" ]; then
  cp "$REPO_DIR/config/kth-cli.example.env" "$USER_CONFIG_DIR/config.env"
  chmod 600 "$USER_CONFIG_DIR/config.env"
  say "Seeded $USER_CONFIG_DIR/config.env from template — EDIT it before first use!"
fi
if [ ! -f "$USER_CONFIG_DIR/project-accounts.yaml" ] && \
   [ -f "$REPO_DIR/config/project-accounts.example.yaml" ]; then
  cp "$REPO_DIR/config/project-accounts.example.yaml" "$USER_CONFIG_DIR/project-accounts.yaml"
  say "Seeded $USER_CONFIG_DIR/project-accounts.yaml from template — edit when ready."
fi
if [ ! -f "$USER_CONFIG_DIR/secrets.env" ] && \
   [ -f "$REPO_DIR/config/secrets.example.env" ]; then
  cp "$REPO_DIR/config/secrets.example.env" "$USER_CONFIG_DIR/secrets.env"
  chmod 600 "$USER_CONFIG_DIR/secrets.env"
  say "Seeded $USER_CONFIG_DIR/secrets.env from template (mode 0600) — fill in API keys before using 'kth receipts'."
fi

# 3) Skill symlinks
mkdir -p "$CLAUDE_SKILLS"
for skill_dir in "$REPO_DIR"/skills/*/; do
  name="$(basename "$skill_dir")"
  ln -sfn "${skill_dir%/}" "$CLAUDE_SKILLS/$name"
  say "Linked skill $name → $CLAUDE_SKILLS/$name"
done

say "Done."
say "Next steps:"
say "  1. Edit $USER_CONFIG_DIR/config.env to set your name/unit/address."
say "  2. (Optional) Edit $USER_CONFIG_DIR/project-accounts.yaml to enable"
say "     project-routing proposals in 'kth efh summary'."
say "  3. Run 'kth login' to complete the one-time KTH MFA bootstrap."

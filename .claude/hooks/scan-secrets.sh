#!/usr/bin/env bash
# PreToolUse hook. Reads the tool-call JSON on stdin and BLOCKS the write
# (exit code 2) if the content looks like it contains a secret.
#
# The JSON is decoded before it is scanned. Matching the raw envelope instead
# does not work: a quote inside the tool input arrives escaped as \", so a
# pattern expecting a bare quote after the separator never fires -- the hook
# reports success while missing the exact case it exists to catch. Decoding
# also means only the proposed content is scanned, not the surrounding
# protocol fields.
#
# Covers every write-shaped tool input: Write (content), Edit (new_string),
# MultiEdit (edits[].new_string), NotebookEdit (new_source), and Bash (command
# -- which catches `echo ... > file` and heredoc routes around the file tools).
#
# It fails closed. If the input cannot be inspected -- no python3, or a body
# that is not the expected JSON -- the write is blocked rather than waved
# through. Under `set -e` a failed command substitution aborts with a status
# that is not 2, which Claude Code reads as a broken hook and allows the write:
# the scanner would go quiet exactly when it cannot see what it is approving.
# Both cases are therefore checked explicitly, and both exit 2.
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "BLOCKED: scan-secrets.sh needs python3 to inspect this write and cannot" >&2
  echo "         verify it. Install python3, or remove the hook from" >&2
  echo "         .claude/settings.json if this repo does not want the check." >&2
  exit 2
fi

input="$(cat)"
scan_status=0
content="$(printf '%s' "$input" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except ValueError:
    sys.exit(3)
if not isinstance(d, dict):
    sys.exit(3)
ti = d.get("tool_input", {}) or {}
parts = [
    ti.get("content", "") or "",
    ti.get("new_string", "") or "",
    ti.get("new_source", "") or "",
    ti.get("command", "") or "",
]
for e in ti.get("edits", []) or []:
    if isinstance(e, dict):
        parts.append(e.get("new_string", "") or "")
print("\n".join(p for p in parts if p))
')" || scan_status=$?

if [ "$scan_status" -ne 0 ]; then
  echo "BLOCKED: scan-secrets.sh could not read the tool input as JSON, so this" >&2
  echo "         write was not scanned for secrets." >&2
  exit 2
fi

# The opening quote is optional: a dotenv-style API_KEY=value carries no quote
# at all and was previously missed. The 12-character floor on the value is what
# keeps `token: ""` and short placeholders from tripping the hook. A quoted
# name, as in JSON or a JavaScript or Python object ("password": "..."), was
# missed entirely before. It has its own rule, which also needs the value
# quoted: a quoted key set to a variable ("token": refresh_token) is ordinary
# code, and blocking it would make writing such code impossible.
#
# The fixed-prefix patterns are token formats with a known shape: Anthropic,
# AWS, private keys, GitHub (classic and fine-grained), npm, Google API keys and
# Slack.
if printf '%s' "$content" | grep -Eiq \
  -e 'sk-ant-[a-z0-9-]+' \
  -e 'AKIA[0-9A-Z]{16}' \
  -e '-----BEGIN ([A-Z]+ )*PRIVATE KEY-----' \
  -e 'gh[pousr]_[A-Za-z0-9]{36,}' \
  -e 'github_pat_[A-Za-z0-9_]{22,}' \
  -e 'npm_[A-Za-z0-9]{36}' \
  -e 'AIza[0-9A-Za-z_-]{35}' \
  -e 'xox[abposr]-[A-Za-z0-9-]{10,}' \
  -e '(api[_-]?key|secret|token|password)[[:space:]]*[:=][[:space:]]*"?[^[:space:]"]{12,}' \
  -e "(api[_-]?key|secret|token|password)[\"'][[:space:]]*[:=][[:space:]]*[\"'][^[:space:]\"']{12,}"; then
  echo "BLOCKED: content appears to contain a secret." >&2
  exit 2
fi

exit 0

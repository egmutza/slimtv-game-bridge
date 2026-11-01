# Git hooks

Foreman installs `pre-push` into `.git/hooks/` when it scaffolds a project.
Hooks are not tracked by git, so a fresh clone does not get one. Reinstall with:

```bash
install -m 755 scripts/hooks/pre-push .git/hooks/pre-push
```

## `pre-push` -- what it protects, and what it does not

It refuses non-fast-forward pushes and remote branch deletions: the two
operations that discard commits already published to a remote. Ordinary pushes,
including direct pushes to `main`, are unaffected.

It exists because Codex's sandbox blocks all writes to `.git` by default, which
is what prevents it from committing. Opening `.git` (via `writable_roots` in
`~/.codex/config.toml`) so `scripts/foreman-commit` can work also grants an
agent running `approval_policy = "never"` the ability to rewrite history with no
prompt. This narrows that back down to the non-destructive subset.

**This is a guard against accidents, not a security boundary.** It lives inside
`.git`, which is exactly the directory the agent can now write, so anything able
to force-push is equally able to delete this file or pass `--no-verify`. Do not
treat it as containment.

For a real boundary on published history, use your host's branch protection --
on GitHub, "Do not allow force pushes" and "Do not allow deletions" on the
default branch. That is enforced server-side, so nothing running on this VM can
circumvent it.

Local damage stays recoverable from `git reflog` for around 30 days; a
force-push that lands on the remote is far harder to walk back. That asymmetry
is why the server-side rule matters more than this hook.

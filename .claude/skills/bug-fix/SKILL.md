---
name: bug-fix
description: Use when fixing a reported bug in this repo, before touching any code.
---

# Bug Fix Routine

## Overview
Repeatable routine for fixing a bug in this repo end-to-end: branch, find
the real root cause, prove it with a failing test, fix it, verify, leave it
ready for review. No external services — everything runs locally.

## Routine

1. **Branch first.** Per CLAUDE.md's Main Branch Protection rule, never fix
   directly on `main`. Create a branch before making any change:
   `git checkout -b fix/<short-description>`.

2. **Find the root cause, not the symptom.**
   REQUIRED SUB-SKILL: use superpowers:systematic-debugging to reproduce the
   bug and trace it to its actual cause before proposing a fix.

3. **Fix it test-first.**
   REQUIRED SUB-SKILL: use superpowers:test-driven-development — write a
   failing test that reproduces the bug (`npm run test --workspace=server`
   or `--workspace=client`, whichever owns the broken behavior), confirm it
   fails for the expected reason, then write the minimal fix that makes it
   pass.

4. **Verify before claiming done.**
   REQUIRED SUB-SKILL: use superpowers:verification-before-completion — run
   `npm test` (root, both workspaces) and `npm run build` and confirm both
   succeed before saying the bug is fixed.

5. **Wrap up the branch.**
   REQUIRED SUB-SKILL: use superpowers:finishing-a-development-branch to
   decide how to integrate the fix (PR vs. other path) — do not merge to
   `main` directly.

## Quick Reference

| Step | Command / skill |
|---|---|
| Branch | `git checkout -b fix/<short-description>` |
| Root-cause | superpowers:systematic-debugging |
| Fix | superpowers:test-driven-development |
| Verify | `npm test`, `npm run build` — superpowers:verification-before-completion |
| Ship | superpowers:finishing-a-development-branch |

## Common Mistakes
- Patching the symptom you can see instead of tracing to root cause —
  re-breaks under slightly different input.
- Committing the fix straight to `main` — violates CLAUDE.md's branch rule.
- Declaring the bug fixed without running `npm test` — untested fixes
  regress silently.

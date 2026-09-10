# Gantt Desk v5 implementation notes

Date: 2026-09-10

## Purpose

Implement the UI and ChatGPT handoff design while preserving existing locally stored schedules and avoiding in-app AI/API dependencies.

## Main changes

- New v5 schedule model with tasks, milestones, categories, pending items, revision, and view settings.
- IndexedDB-first persistence with localStorage fallback and revision conflict detection.
- One-time migration from legacy v2/v3 localStorage project data with a pre-migration browser backup.
- List + Gantt workspace, responsive mobile list/Gantt modes, search, filters, scale, fit/today controls, details editing and period movement.
- ChatGPT manual handoff through `https://chatgpt.com/?prompt=` with copy fallback for long prompts.
- Strict `handoffVersion: 1` JSON validation and `needsReview` storage for unresolved dates.
- Backup JSON, TSV and XLSX output.
- CI validation for JavaScript syntax, production entrypoint, no in-app AI API, date/JSON contracts and XLSX ZIP integrity.

## Known implementation fixes completed before PR

- Corrected XLSX CRC32 byte progression from `crc >>> 1` to `crc >>> 8`.
- Ensured a newly created task is selected before the post-commit render, so list/Gantt selection is visible immediately.
- Changed copy actions so success messages are displayed only after clipboard success.
- Changed long ChatGPT handoff to copy the full prompt first, then open ChatGPT.
- Prevented a failed popup/copy operation from being overwritten by a success toast.
- Switched the production `index.html` entrypoint from the legacy runtime to v5 only.

## Verification boundary

CI verifies static/runtime-contract concerns that can run in GitHub Actions. Final browser behavior, responsive layout, local data migration with real user data, multiple-tab conflict UX, clipboard permissions, popup behavior and GitHub Pages deployment must be checked after merge on the published URL. These are not declared verified until that check is performed.

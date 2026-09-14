# One Overview Model — implementation specification

## Problem
「プロジェクト全体を見る」という一つの目的に対して、Fit geometry と semantic Macro 判定が別レイヤーで管理されている。ユーザーには Macro という実装概念を学ばせず、`全体` を一つの操作として成立させる。

## Decision
- `13-overview-density.js` is the single owner of overview geometry and representation selection.
- `15-macro-overview.js` renders the Shape representation only; it no longer wraps `fitAll()` or decides when Shape is needed.
- Horizontal zoom remains a manual time-axis override.
- Row height remains a manual task-axis override.
- Manual display edits turn off auto overview and leave Shape where applicable.
- Automatic resize re-fit uses hysteresis to prevent representation thrashing.
- `overviewMacroMode` remains for storage compatibility; no storage schema migration.
- JSON contracts remain unchanged.

## Representation resolver
`resolveOverviewRepresentation(tasks, availableHeight, reason)` returns `shape | rows`.

Explicit overview:
- `shape` when `tasks.length * 20 > availableHeight`
- otherwise `rows`

Automatic resize while `overviewAutoFit === true`:
- current rows -> enter Shape only when required height exceeds available height by 40px
- current Shape -> leave Shape only when required height fits with 40px spare

Hysteresis only affects automatic resize. Explicit `全体` always resolves against the actual fit boundary.

## Focus preservation
- Preserve `state.selectedTaskId` across Overview.
- Shape renderer marks a selected task/milestone with `.is-selected`.
- Category filters remain unchanged by Overview.
- Time Compass derives from the resulting view as before.

## Manual override
- Row/text direct controls and Display Settings set `overviewAutoFit=false` and `overviewMacroMode=false`.
- Horizontal zoom sets `overviewAutoFit=false` but does not force a vertical representation change.
- Explicit Lens drill-down continues to leave Shape.

## UI language
Shape representation header uses `全体` instead of `PROJECT SHAPE`. The count reads `N件 · M分類`. `shape/plan/edit` remain internal surface levels only.

## Acceptance
- One click on `全体` resolves both geometry and representation.
- 18-task project resolves to rows; 60-task dense project resolves to Shape at 1440x900.
- Selected task remains visually identifiable after returning to Overview.
- Manual row change disables auto overview and does not immediately re-enter Shape.
- Auto resize has hysteresis.
- Existing public suites continue to pass.
- No Local Storage or AI handoff JSON schema change.

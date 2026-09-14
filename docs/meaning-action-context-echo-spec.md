# Gantt Desk — Meaning → Action / Rhythm Context Echo

Date: 2026-09-14
Status: coding-level implementation spec

## 1. Previous phase gate

Project Rhythm Landmarks is considered complete only after:

- PR #9 merged
- Validate v5 success
- GitHub Pages deployment success
- Public UX smoke #90 success
- existing six suites + Project Rhythm suite all green
- flat schedule = zero derived rhythm windows
- clustered schedule = one to three derived rhythm windows

This gate was satisfied before this phase started.

## 2. Product problem

One Overview reduced the decision “how should I see the whole project?”.
Project Rhythm reduced part of the decision “where should I look?”.

The remaining gap is:

> When a concentration window attracts attention, what does that window mean without opening a new panel or manually inspecting every task?

The target product flow is:

`Shape → Attention → Meaning → Action`

The new behavior must shorten Attention → Meaning without creating a new mode, panel, persistent state, or project-data field.

## 3. Attention → Meaning questions

When a user notices a rhythm window, useful questions include:

1. Which tasks make up this concentration?
2. Which categories dominate it?
3. How many visible tasks overlap the window?
4. Which tasks are outside the window?
5. Is the window mostly one category or cross-functional?
6. Does it include the currently selected task?
7. Does it contain milestones?
8. Which tasks begin inside it?
9. Which tasks end inside it?
10. Which tasks span the whole window?
11. Is the apparent concentration still relevant under the current filter?
12. Does the shape come from long tasks or a burst of short tasks?
13. Which category rows matter in Macro Overview?
14. Can I identify the source tasks before zooming?
15. Can I preserve the whole-project context while understanding the peak?
16. Can I reach the exact period after understanding it?
17. Can keyboard users receive the same meaning?
18. Can the meaning disappear cleanly when attention leaves?
19. Can selected/multi-selected tasks remain visually authoritative?
20. Can the feature stay quiet on mobile where the Time Compass is absent?
21. Can it work with no new task metadata?
22. Can it work without guessing “importance” or “risk”?

## 4. Idea space

Explored approaches included:

1. Semantic label layer
2. Phase-like labels inferred from categories
3. Permanent category composition text
4. Representative task names
5. Longest-task callout
6. First/last task callout
7. Milestone chapter labels
8. Start-burst annotation
9. Finish-burst annotation
10. Category composition in the existing annotation
11. Contextual task highlighting
12. Contextual task suppression
13. Category-row echo in Macro Overview
14. Task-row echo in PLAN
15. Timeline-row echo in PLAN
16. Hover-only lightweight Lens
17. Focus-only lightweight Lens
18. Temporary label collapse
19. Selected-task relationship to the rhythm window
20. Context breadcrumb
21. Focus memory
22. Previous/next rhythm navigation
23. Window-local search
24. Category dominance stripe
25. Start/finish edge markers
26. “inside/outside window” sorting
27. Dim unrelated tasks
28. Enlarge related task bars
29. Temporarily hide unrelated tasks
30. Existing surface + existing annotation only

## 5. Six directions

### A. Semantic Label Layer
Change the left-side semantic unit as the representation moves from SHAPE to PLAN to EDIT.

### B. Contextual Echo
Use cue-based emphasis/suppression on existing tasks while the user points to or focuses a rhythm window.

### C. Category Composition
Return a compact category breakdown in the existing Time Compass annotation.

### D. Representative Task
Show one or two representative tasks for the window.

### E. Focus Memory
Remember the current viewport/task and provide a way back after drill-down.

### F. Start / Finish Rhythm
Explain concentration by whether tasks are starting or finishing together.

## 6. Comparison

| Direction | Meaning speed | New chrome | New data | Visual calmness | Implementation risk | Fit now |
|---|---:|---:|---:|---:|---:|---:|
| Semantic Label Layer | 5 | 0 | 0 | 3 | 4 | 3 |
| Contextual Echo | 5 | 0 | 0 | 5 | 2 | 5 |
| Category Composition | 4 | 0 | 0 | 5 | 1 | 5 |
| Representative Task | 3 | low | 0 | 3 | 3 | 3 |
| Focus Memory | 3 | low | transient/history | 4 | 3 | 3 |
| Start / Finish Rhythm | 4 | 0 | 0 | 4 | 3 | 4 |

Adopted direction: **Rhythm Context Echo**, combining Contextual Echo with Category Composition as one interaction. Category Composition is not a separate persistent feature; it is the textual half of the same cue.

## 7. Why this direction

The project already has the exact objects needed to explain a rhythm window: task rows, task bars, category lanes, and one Time Compass annotation channel.

Adding a panel would duplicate those objects. Instead, the existing surface should answer the question by temporarily changing salience:

- matching tasks remain fully legible
- unrelated tasks become quiet
- matching categories remain legible in SHAPE
- the existing annotation returns the top category counts
- leaving the rhythm cue restores the surface exactly

The system does not infer “important”, “critical”, or “risky”. It only exposes which visible tasks intersect an observed time window.

## 8. Cognitive model

Before:

`notice rhythm → click/zoom → inspect tasks → infer meaning`

After:

`notice rhythm → hover/focus → meaning appears → click only if action/detail is needed`

No new user concept is introduced. “Rhythm window” keeps its existing meaning; it now echoes into the surface.

## 9. Add / Change / Remove / Keep

### ADD

- transient Context Echo classes on existing DOM
- derived category composition for the active rhythm window
- contextual accessible name while a rhythm window owns focus/hover
- E2E coverage in the existing Project Rhythm suite

### CHANGE

- rhythm hover/focus annotation includes category composition + visible task count
- Project Rhythm runtime version becomes `20260914-rhythm3`
- Time Compass runtime version becomes `20260914-compass6`

### REMOVE

- no existing product UI is removed
- no existing state is removed
- Echo classes and contextual accessible labels are always removed when the interaction ends

### KEEP

- Time Compass height 36px
- existing rhythm window DOM
- Project Rhythm click-to-focus behavior
- One Overview
- Macro Overview
- Detail Lens
- row-height manual control
- horizontal zoom
- Local Storage schema
- task schema
- AI handoff JSON
- mobile Ribbon behavior

## 10. File change map

### MODIFY

`src/v5/classic/18-time-compass.js`
- remains the single owner of Rhythm derivation, meaning derivation, Echo activation, and Echo cleanup

`assets/v6-workspace-ux.css`
- owns PLAN/list/timeline Echo visual states

`assets/v9-macro-overview.css`
- owns SHAPE/Macro Echo visual states

`index.html`
- cache-bust changed runtime/CSS owners

`scripts/public-e2e-project-rhythm.mjs`
- extend the existing suite instead of adding a new conceptual suite

`.github/workflows/validate-v5.yml`
- lock owner/version contracts

`.github/workflows/public-smoke.yml`
- verify public cache versions and Echo contracts before browser suites

### ADD

`docs/meaning-action-context-echo-spec.md`

### KEEP

- `13-overview-density.js`
- `15-macro-overview.js` logic
- `16-macro-detail-lens.js`
- `17-project-surface.js`
- `v12-time-compass.css` geometry
- storage/data contracts

## 11. DOM specification

No new persistent DOM node is added.

Existing Rhythm button gains one source-of-truth label copy:

```html
<button
  class="time-compass-rhythm-window is-primary"
  data-rhythm-start="YYYY-MM-DD"
  data-rhythm-end="YYYY-MM-DD"
  data-rhythm-peak-date="YYYY-MM-DD"
  data-rhythm-peak="12"
  data-rhythm-base-label="集中期間 ..."
  aria-label="集中期間 ..."
></button>
```

During Echo, existing workspace nodes gain transient classes:

```text
#workspace.is-rhythm-echo
.task-row.is-rhythm-match | .is-rhythm-muted
.timeline-row.is-rhythm-match | .is-rhythm-muted
[data-macro-task].is-rhythm-match | .is-rhythm-muted
[data-macro-category-focus].is-rhythm-match | .is-rhythm-muted
```

Workspace receives transient diagnostics only:

```text
data-rhythm-echo-key
data-rhythm-echo-start
data-rhythm-echo-end
data-rhythm-echo-count
```

They are not persisted and are deleted on cleanup.

## 12. State specification

No new `state.*` field.

Module-local transient cache only:

| Value | Type | Owner | Persisted | Purpose |
|---|---|---|---|---|
| `activeEchoKey` | string | 18 | no | avoid repeating DOM work during pointermove |
| `activeEchoContext` | object/null | 18 | no | reuse currently derived context |

Derived context:

```js
deriveRhythmContext(start, end) -> {
  tasks: Task[],
  categories: { id, name, count }[]
}
```

Source tasks come from `filteredTasks()` when available so the Echo describes the currently visible project surface.

## 13. Function specification

### `surfaceTasks() -> Task[]`
Returns current filtered tasks, falling back to all project tasks if the filtering helper is unavailable.

### `deriveRhythmContext(start, end) -> Context`
Pure-ish read-only derivation. Selects visible tasks intersecting `[start,end]`, counts categories, sorts category counts descending.

### `rhythmMeaning(context) -> string`
Compact visual annotation such as:

`制作6・企画6 +1分類 · 12件`

### `rhythmAccessibleMeaning(context) -> string`
Longer Japanese accessible description, up to three category counts plus total visible tasks.

### `applyRhythmContext(element) -> Context | null`
- derives context
- adds `is-rhythm-echo` to workspace
- marks normal rows/timeline rows or Macro bars/categories as match/muted
- updates the active Rhythm button accessible name
- caches the active derivation

### `clearRhythmContext() -> void`
- removes workspace Echo class
- deletes Echo dataset values
- removes every match/muted class
- restores each Rhythm button to `data-rhythm-base-label`
- clears module-local cache

### `rhythmAnnotation(element, context?) -> string`
Combines existing time/peak summary with category composition.

## 14. Event specification

| Target | Event | Behavior |
|---|---|---|
| rhythm window | pointer hover | apply Echo + contextual annotation |
| rail | pointer leaves rhythm | clear Echo; fall back to day stats/default annotation |
| rhythm window | focusin | same Echo as pointer users |
| rail | focusout | clear Echo when focus leaves the rail |
| rhythm window | Enter / Space | clear Echo, then existing focus/zoom action |
| rhythm window | pointerdown | clear Echo, then existing focus/zoom action |
| milestone | hover/focus/activate | milestone has priority; clear Rhythm Echo |
| Time Compass | Ctrl/Cmd-wheel | clear Echo before manual zoom |
| Compass hidden/mobile | sync | clear transient Echo |

Interaction priority remains:

`Milestone > Rhythm Echo > Day stats`

## 15. CSS specification

### PLAN owner: `v6-workspace-ux.css`

- normal task/timeline rows transition opacity/background for 120ms
- unrelated rows opacity: `0.26`
- matching unselected task row: `var(--primary-soft)`
- matching unselected timeline row: `rgba(62,106,90,.045)`
- selected/multi-selected rows remain opacity 1
- no pointer-events changes

### SHAPE owner: `v9-macro-overview.css`

- unrelated Macro task/milestone opacity: `0.16`, lower saturation
- matching task/milestone opacity: 1
- completed matching task remains semantically quieter (`0.52`) unless selected
- unrelated category row opacity: `0.38`
- matching category row uses `var(--primary-soft)`
- selected Macro task remains authoritative

### Reduced motion

`prefers-reduced-motion: reduce` removes Echo transitions.

No `!important` is introduced.

## 16. Responsive specification

### >=1200
Full Echo on PLAN and SHAPE.

### 768–1199
Same behavior; annotation truncation continues to be owned by Time Compass CSS.

### <768 / 390px
Project Ribbon is already absent. Echo never activates. No new mobile chrome and no overflow.

## 17. Accessibility specification

- Rhythm targets stay native `button`
- keyboard `focusin` produces the same meaning as pointer hover
- Enter/Space activation is unchanged
- active button accessible name includes the category composition and visible task count
- accessible name resets when Echo ends
- match/mute is supplemental; no task is removed from accessibility tree
- no information relies on color alone because annotation/accessibility text carries the meaning
- reduced-motion respected

## 18. Persistence / JSON

Local Storage schema: **NO CHANGE**

Task schema: **NO CHANGE**

AI handoff JSON: **NO CHANGE**

App-internal AI: **NO CHANGE / none**

Echo is entirely derived and transient.

## 19. Performance

- Context derivation runs only while a Rhythm window is hovered/focused
- filtered task scan is O(n), capped by existing task limits
- repeated pointermove inside the same Rhythm window uses `activeEchoKey` cache
- DOM class writes happen only when active window changes
- no MutationObserver
- no scroll-time full context derivation
- no re-render required for Echo itself

## 20. Failure cases

1. zero tasks → no Rhythm/Echo
2. <8 tasks → no Rhythm/Echo
3. flat project → no false Rhythm/Echo
4. PLAN clustered project → task + timeline Echo
5. SHAPE clustered project → Macro task + category Echo
6. selected task outside window → remains visually authoritative
7. selected task inside window → remains authoritative
8. multi-selection → not hidden by Echo
9. completed matching Macro task → still appears completed
10. category with zero matching tasks → muted in SHAPE
11. filter active → context describes filtered surface tasks
12. search active → context describes filtered surface tasks
13. milestone under pointer → milestone meaning wins
14. pointer leaves rail → Echo fully clears
15. focus leaves rail → Echo fully clears
16. Enter activates Rhythm → Echo clears before zoom
17. wheel zoom → Echo clears
18. Present → existing Compass visibility rules apply
19. mobile → no Echo
20. task content revision changes → cache key invalidates
21. Rhythm static render changes → contextual ARIA starts from new base label
22. reduced-motion → no transition dependency

## 21. Implementation order

1. complete previous Project Rhythm gate
2. add pure context derivation in v18
3. add transient Echo application/cleanup
4. integrate pointer/focus/activation priority
5. add PLAN CSS to v6
6. add SHAPE CSS to v9
7. bump cache/runtime versions
8. extend existing Project Rhythm E2E
9. add static ownership/version guards
10. Validate PR
11. merge main
12. GitHub Pages deployment
13. public seven-suite smoke
14. final audit

## 22. Acceptance criteria

1. Previous Project Rhythm public gate remains green.
2. New primary controls = 0.
3. New panels = 0.
4. New persisted fields = 0.
5. Local Storage / task / AI JSON schemas unchanged.
6. Time Compass height remains 36px ±1px.
7. PLAN Rhythm hover produces >0 matching and >0 muted task/timeline rows for a mixed fixture.
8. SHAPE Rhythm hover produces >0 matching and >0 muted Macro tasks and categories for a mixed fixture.
9. Existing Time Compass annotation includes at least one category name during Echo.
10. Keyboard focus produces the same Echo.
11. Pointer/focus exit leaves zero `.is-rhythm-match` / `.is-rhythm-muted` nodes.
12. Accessible Rhythm label resets to its base value after Echo.
13. Clicking/Enter still sets `overviewAutoFit=false` and preserves row density.
14. Flat fixture remains zero Rhythm windows.
15. 390px has no document horizontal overflow.
16. Public runtime has zero page errors in E2E.
17. Existing seven conceptual suites remain green; no weaker assertion is substituted.

## 23. Rollback

Feature has no data migration.

Rollback consists of reverting:

- v18 Context Echo logic/version
- v6/v9 Echo styles
- index cache keys
- related Project Rhythm test assertions
- workflow ownership/version guards

Project Rhythm Landmarks then continue to work exactly as before.

## 24. Before / After

### Before

`Rhythm noticed → click → zoom → inspect rows → infer category/task meaning`

### After

`Rhythm noticed → hover/focus → existing tasks/categories echo → click only if deeper action is needed`

Primary controls: unchanged.
Persistent labels: unchanged.
Panels: unchanged.
Persisted state: unchanged.

## 25. NOW / NEXT / LATER

NOW: **Rhythm Context Echo**

NEXT: **Semantic Label Layer**, but only if Echo proves that semantic granularity remains the next bottleneck after attention cues already explain local meaning.

LATER: **Focus Memory**, when navigation depth is high enough that returning to prior context becomes a measurable cost.

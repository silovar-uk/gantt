# Gantt Desk — Project Meaning Model / Project Rhythm Landmarks

Date: 2026-09-14
Status: implementation spec

## 1. Current state

Gantt Desk already separates the major runtime responsibilities:

- `13-overview-density.js`: One Overview / density
- `15-macro-overview.js`: high-level category-lane representation
- `16-macro-detail-lens.js`: focus detail
- `17-project-surface.js`: surface navigation
- `18-time-compass.js`: time context / navigation
- `19-ui-polish.js`: visual polish

The One Overview phase reduced the question “how should I view the whole project?”. The next product question is “where should I look once the whole project is visible?”.

## 2. Research synthesis

Patterns worth keeping:

- Semantic zoom should preserve scope, layout direction, and spatial predictability while changing semantic granularity.
- High-level timelines work best when granular implementation detail is suppressed rather than merely miniaturized.
- DAW/video timelines use locators and markers as lightweight temporal landmarks rather than adding a dashboard.
- Dependency and critical-path products can make attention explicit, but they require relationship data that Gantt Desk does not currently have.

Conclusion: prefer a zero-new-data temporal landmark that uses objective schedule facts and lives inside the existing Time Compass.

## 3. Thirty project-reading questions

1. When does the project start?
2. When does it end?
3. Where is today?
4. What is the next explicit milestone?
5. Where do the most tasks overlap?
6. Where is the project relatively quiet?
7. When does activity begin to rise?
8. When does activity fall away?
9. Which periods contain many task starts?
10. Which periods contain many task finishes?
11. Which category dominates a period?
12. Where do categories overlap?
13. What is the longest-running task?
14. Where are short bursts concentrated?
15. Where are the largest gaps?
16. Which dates are explicit deadlines?
17. Which tasks are already completed?
18. Which milestones are close together?
19. Where does the project change rhythm?
20. What period deserves inspection first?
21. What did I last focus on?
22. How do I return to context?
23. What is visible versus outside the viewport?
24. How much of the full project is visible?
25. Which task is currently selected?
26. Which category contains that task?
27. How dense is the current viewport?
28. What starts next after today?
29. What ends next after today?
30. Is the schedule flat or concentrated?

## 4. Idea space

Explored ideas included:

1. Semantic label layer
2. Category dominance labels
3. Inferred phase bands
4. Milestone chapters
5. Deadline spotlight
6. Peak-overlap windows
7. Quiet-buffer windows
8. Start-burst markers
9. Finish-burst markers
10. Category-transition markers
11. Long-task spine
12. Short-task burst visualization
13. Selected-task context trail
14. Focus history
15. Viewport history
16. Back-to-context navigation
17. Previous/next landmark keys
18. Relationship-on-demand
19. Change-since-last-open
20. Schedule diff overlay
21. Project rhythm summary
22. Attention bands
23. Today-to-next-milestone runway
24. Next three events
25. Milestone clustering
26. Deadline clustering
27. Empty-space semantics
28. Adaptive category summaries
29. Present narrative chapters
30. Time Compass landmark navigation
31. Local peak explanation
32. Category density ridge
33. Focus-preserving drill-down
34. Progressive hover meaning
35. Automatic attention summary

## 5. Six directions

### A. Semantic Label Layer
Change the left-side semantic unit across SHAPE / PLAN / EDIT.

### B. Temporal Landmarks
Expose meaningful points/windows on the existing time surface.

### C. Focus Memory
Remember and restore recent focus/viewport context.

### D. Relationships on Demand
Reveal predecessors/successors only on selection.

### E. Project Rhythm
Turn task overlap into an objective rhythm of concentration and quiet.

### F. Change Awareness
Show what moved/appeared/disappeared since a prior snapshot.

## 6. Comparison

| Direction | Understanding impact | New data | Chrome cost | Risk | Fit now |
|---|---:|---:|---:|---:|---:|
| Semantic Label | 4 | 0 | 0 | 3 | 4 |
| Temporal Landmarks | 5 | 0 | 0 | 2 | 5 |
| Focus Memory | 3 | 0 | 0 | 2 | 4 |
| Relationships | 5 | high | 0 | 4 | 2 |
| Project Rhythm | 5 | 0 | 0 | 2 | 5 |
| Change Awareness | 4 | snapshot/history | low | 4 | 2 |

Adopted direction: **Project Rhythm Landmarks** = Temporal Landmarks + objective activity rhythm, implemented as one feature in Time Compass.

## 7. Why this direction

The product must not infer “importance” from weak evidence. Instead it can safely expose observable facts:

- explicit milestones/deadlines
- task overlap concentration
- current viewport
- today

A concentrated period is not labelled “critical” or “risky”. It is labelled `集中` and described by the maximum number of concurrently active tasks.

## 8. Product behavior

### Whole-project state

If the project has a clear concentration window, the single Time Compass annotation changes from:

`全体表示`

to:

`集中 10/12–10/18 · 最大12件`

The project is still in the same Overview state; this is an attention cue, not a new mode.

### Rhythm windows

Up to three derived concentration windows appear as low-contrast bands inside the existing Time Compass rail.

- no permanent text inside the rail
- no new toolbar button
- no panel
- milestone diamonds remain above rhythm bands
- viewport bracket remains unchanged

Hover/focus updates the existing single annotation channel.

### Activation

Selecting a rhythm window zooms around that time window and centers it. It does not change project data or semantic scope.

### Manual control

After focusing a rhythm window:

- `overviewAutoFit = false`
- horizontal zoom becomes manual
- row density is unchanged
- representation (`rows` / high-level category lanes) is unchanged

## 9. Derivation algorithm

Source: existing project tasks only.

The algorithm deliberately separates **candidate discovery** from **truth validation** so bucket compression can never fabricate concurrency.

1. Reuse the Time Compass 48-bucket activity model only to discover candidate concentration regions.
2. Each task increments every coarse bucket intersected by its `[start, end]` span.
3. Do not derive candidates when:
   - fewer than 8 tasks, or
   - maximum bucket activity < 3, or
   - coarse activity is effectively flat.
4. Compute median bucket activity.
5. Candidate threshold = max(`3`, `ceil(bucketMax * 0.68)`, `floor(bucketMedian) + 1`).
6. Find contiguous bucket runs whose value >= threshold.
7. Convert each candidate run back to real start/end dates.
8. For each candidate, run an exact inclusive interval sweep over the real task dates:
   - add `+1` at each clipped task start;
   - add `-1` on the day after each clipped task end;
   - sweep sorted dates to obtain the true maximum concurrent task count and exact peak date.
9. Drop any candidate whose **exact** concurrency peak is < 3. This prevents non-overlapping tasks that merely share a coarse bucket from becoming a false landmark.
10. Score surviving windows by exact peak concurrency first and coarse average density second.
11. Keep at most three windows.
12. First window is `primary`.
13. All UI labels (`最大N件`) and focus anchors use the exact peak count/date, never the bucket approximation.

This is derived state only; it is never persisted.

## 10. File change map

### MODIFY

`src/v5/classic/18-time-compass.js`
- owner of derived rhythm windows
- coarse candidate discovery + exact-overlap validation
- render/interact/announce rhythm landmarks
- distinguish explicit deadlines in existing milestone rendering if present

`assets/v12-time-compass.css`
- rhythm band geometry and states
- deadline marker state if used

`index.html`
- cache-bust v12 + v18 assets only

`.github/workflows/public-smoke.yml`
- verify matching public runtime
- run dedicated rhythm E2E

`.github/workflows/validate-v5.yml`
- syntax check rhythm E2E and ownership guard

### ADD

`scripts/public-e2e-project-rhythm.mjs`
- objective derivation and interaction checks
- explicit regression guard that flat, non-overlapping schedules produce zero rhythm windows even when coarse buckets collide

`docs/project-meaning-model-spec.md`
- this specification

### KEEP

- task schema
- Local Storage schema
- AI handoff JSON
- Overview resolver
- Macro renderer
- Detail Lens
- Project Surface navigation
- Present HUD

## 11. DOM specification

Inside existing `.time-compass-rail`:

```html
<div class="time-compass-busy"></div>
<div class="time-compass-rhythm" aria-label="プロジェクトの集中期間">
  <button
    type="button"
    class="time-compass-rhythm-window is-primary"
    data-rhythm-start="YYYY-MM-DD"
    data-rhythm-end="YYYY-MM-DD"
    data-rhythm-peak-date="YYYY-MM-DD"
    data-rhythm-peak="12"
    aria-label="集中期間 10月12日から10月18日 最大12件進行"
  ></button>
</div>
<div class="time-compass-markers"></div>
```

No visible text is placed inside a rhythm button.

## 12. State specification

No new persisted state.

Derived only:

| Value | Owner | Source | Persisted |
|---|---|---|---|
| rhythm windows | 18 | task dates | no |
| primary rhythm | 18 | rhythm windows | no |
| rhythm hover/focus | DOM focus/pointer | interaction | no |

Existing `overviewAutoFit` is set to false only after rhythm-window activation because that action is a manual horizontal focus.

## 13. Function specification

### `deriveRhythmLandmarks(range) -> Landmark[]`
Uses coarse buckets for candidate discovery, validates each candidate with exact task-overlap counts, and returns only truthful concentration windows.

### `exactPeakForRange(start, end) -> { peak, peakDate }`
Sweeps exact inclusive task intervals in a candidate date range. This function is authoritative for the `最大N件` value and the date used as the focus anchor.

### `renderRhythmLandmarks(track, range) -> void`
Writes up to three buttons into `.time-compass-rhythm` and stores primary summary data on the track for default annotation.

### `rhythmAnnotation(element) -> string`
Returns `集中 M/D–M/D · 最大N件`.

### `nearestRhythmWindow(rail, clientX) -> HTMLElement | null`
Returns a rhythm window under/near the pointer.

### `focusRhythmRange(start, end, peakDate) -> void`
Chooses a dayWidth sufficient to make the window legible, disables auto-fit, renders, then centers on the exact peak date.

## 14. Event specification

| Target | Event | Result |
|---|---|---|
| rhythm window | pointerdown | focus rhythm range; stop Project Ribbon drag |
| rhythm window | keyboard Enter/Space | same action |
| rail | pointermove | milestone > rhythm > day stats annotation priority |
| rail | pointerleave | restore default annotation |
| rhythm window | focus | show rhythm annotation |
| rhythm window | blur | restore default annotation |

## 15. Geometry / CSS

- rhythm holder: absolute `inset: 0`, z-index 2
- rhythm button: vertically centered band, `top: 3px`, `bottom: 3px`
- minimum visual width: 4px
- minimum hit width: 14px using pseudo/transparent hit area if needed
- primary band uses slightly stronger border/opacity
- milestone z-index remains 3
- hover pointer remains 4
- viewport bracket remains visually readable above/beside rhythm bands
- no Compass height increase; remains 36px

## 16. Responsive

- `>=768`: rhythm landmarks enabled
- `<768`: Project Ribbon remains hidden, therefore no new mobile chrome
- no document horizontal overflow

## 17. Accessibility

- rhythm windows are native buttons
- each has an explicit Japanese accessible name containing dates + exact peak count
- keyboard Enter/Space activates
- focus-visible does not rely only on color
- no animation required
- no live region: annotation change is supplemental, button accessible name is authoritative

## 18. Persistence / JSON

Local Storage schema: **NO CHANGE**

AI handoff JSON: **NO CHANGE**

Task schema: **NO CHANGE**

## 19. Performance

- candidate discovery reuses maximum 48 buckets: O(tasks × 48), capped by 1000 × 48
- exact validation runs only for coarse candidate windows and scans task interval events; practical cost remains bounded by candidate count and task count
- keep at most three final landmarks
- derive only when static Time Compass signature changes
- no MutationObserver
- no scroll-time recomputation of rhythm windows

## 20. Edge cases

- 0 tasks: no Compass / no rhythm
- <8 tasks: no rhythm landmarks
- flat activity: no rhythm landmarks
- multiple non-overlapping tasks compressed into one coarse bucket: exact sweep rejects the false peak
- one giant task: no false “peak”
- 1000 tasks: coarse discovery remains bucket bounded; exact validation is candidate-limited
- >730-day project: Compass can derive across full project range; clicking focuses via dayWidth rather than changing task data
- selected task: unchanged
- Lens open: unchanged
- Present: Compass hidden according to existing behavior
- mobile: feature absent with Ribbon

## 21. Acceptance criteria

1. No new primary control or panel.
2. Time Compass height stays 36px ±1px.
3. A flat/even project renders zero rhythm windows, including schedules that collide only because of bucket compression.
4. A clearly clustered project renders 1–3 rhythm windows.
5. `最大N件` equals true same-date concurrency, not bucket occupancy.
6. Whole-state default annotation names the primary concentration window when one exists.
7. Clicking the primary window sets `overviewAutoFit = false` and moves the visible time context toward the exact peak date.
8. Row height does not change on rhythm activation.
9. Milestones remain clickable.
10. Existing five UX suites + One Overview suite remain green.
11. New Project Rhythm suite is green on public GitHub Pages.
12. 390px mobile has no horizontal overflow.
13. Storage and AI JSON contracts remain byte/schema compatible.

## 22. Rollback

Feature is isolated to v18 Time Compass rendering + v12 CSS. Reverting those two files and the index cache keys removes the feature without data migration.

## 23. NOW / NEXT / LATER

NOW: Project Rhythm Landmarks

NEXT: Semantic Label Layer — only after rhythm landmarks prove that attention cues are useful without adding chrome.

LATER: Focus Memory — pair with semantic labels when Project Surface navigation becomes deeper.

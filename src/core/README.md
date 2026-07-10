# Gantt Desk core architecture

The active runtime is intentionally small and explicit.

## Entry point

- `src/main.js`
  - binds user interactions
  - calls store actions
  - never writes project localStorage directly

## Canonical state

- `src/core/store.js`
  - owns the in-memory project state
  - owns undo / redo history
  - persists `gantt-desk:v2:project`
  - synchronizes the active saved-project record

The only canonical display state is `project.view`:

- `rowHeight`
- `dayWidth`
- `panelWidth`
- `density`
- `categoryMode`
- `showCompleted`
- `start`
- `end`

CSS variables and form values are rendered from this state. They are not separate sources of truth.

## Project schema

- `src/core/project.js`
  - normalizes projects and tasks
  - migrates legacy display settings once during load
  - clamps row height to 18–72px
  - contains date and escaping utilities

## Rendering

- `src/core/view.js`
  - owns all task-list and timeline DOM
  - renders checkboxes and row-resize handles as first-class elements
  - renders the display panel and contextual bulk bar
  - provides lightweight live row-height and panel-width preview functions

## Styling

- `assets/app.css` contains the original base styles.
- `assets/core-v3.css` contains the canonical component and interaction styles.

JavaScript modules must not inject large style blocks.

## Interaction rules

- Task-row click opens the inspector.
- Checkbox click only changes bulk selection.
- Row-boundary drag only changes global row height.
- Pane drag only changes task-panel width.
- Timeline-bar drag only changes task dates.

Interactive child elements must never fall through to the task-row click handler.

## Legacy files

The previous `*-layer.js` files and `src/app.js` remain in the repository temporarily for reference, but they are not loaded by `index.html`.

Do not restore dynamic loading through `project-library-polish.js`.
Do not add MutationObserver or setInterval loops to repair rendered DOM.
Do not duplicate display state in another localStorage key.

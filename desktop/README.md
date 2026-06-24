# Kartograph Desktop

An Electron app for viewing Kartograph maps. Open a project folder — the app reads its
map from `<folder>/.kartograph/kartograph.json`; each project opens in its own tab and
several can be open at once.

## Run

    cd desktop
    npm install
    npm start

File → Open Project… (or the `+` tab) picks a project folder; Kartograph reads its map
from `<folder>/.kartograph/kartograph.json`. Open tabs and a recent list are restored on
the next launch.

## Views

- **Map** — capability graph; drag nodes to lay them out (saved to `.kartograph/kartograph.layout.json`).
- **Board** — scenario Kanban; drag a card to change its progress tag in the `.feature` file.
- **Features** — browse all `.feature` files, full Gherkin render, tag filter + search, raw view.
- **Sidebar** — maturity, glossary, ADRs, open questions.

The deterministic board/feature logic is shared with `server/serve.js` via
`workflows/lib/board-data.js` and `workflows/lib/feature-read.js`. Packaging
(installers/auto-update) is a future follow-up; this is a dev-run app for now.

# token-radar-v2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/taigedi123/token-radar-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/taigedi123/token-radar-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: every protocol in the sealed DefiLlama snapshot that records no token,
ranked by an implied value — what a token would be worth if the protocol's record stayed as it
is — with a concrete farm plan for each row.

The model (radar-3) prices a pre-token protocol from the snapshot's own figures only. Each
category's live-token protocols give a market-cap / TVL multiple (each ratio winsorised, the
median shrunk toward the global live median with a prior weight that grows as the evidence
thins — one live peer cannot price a category); that multiple is then scaled by size, because
the snapshot's own live set shows market-cap / TVL falling as TVL grows (a slope of about
-0.34 per decade, recomputed from the snapshot on every run), and adjusted by the protocol's
seven-day TVL momentum and by how long it has run with no token. Every row carries a
confidence — peer count, then how far its size is extrapolated from its peers — and the detail
view names the evidence and the limits. The board covers all 40 watchlist protocols and adds
every other rankable pre-token protocol the same product rule keeps — 198 rows on this
snapshot — while protocols whose token already trades are set aside as the live comparables the
calibration comes from. No protocol name is special-cased: one function scores every row, and
the dashboard recomputes each row in the page and shows its number beside the board's.

The dashboard is a static page with no network: a sortable, filterable board (search, category,
chain, watchlist-only), a detail view per protocol with the factor-by-factor breakdown and a
seven-step farm plan with costs and times, a live-comparables view, a calibration table, and a
model sandbox that re-ranks the board under what-if constants.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes `out/board.json` and
`out/data.js`, copies `dashboard/` and `screenshots/` into `out/`, and writes `out/dossier.json`.
Open `out/dashboard/index.html` in a browser to use the radar. The run is deterministic: two
runs on the same snapshot write the same bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=5xww654b&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

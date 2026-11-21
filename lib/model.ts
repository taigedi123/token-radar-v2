// Token Radar's model, third generation: one sealed snapshot in, one ranked board out.
//
// The board ranks every protocol that records no token and is not a wrapped, staked, bridged or
// versioned product of one that already trades: the snapshot's 40-slug watchlist (the floor, never
// the ceiling) plus every early protocol below that floor the same product rule keeps. Protocols
// whose token already trades are set aside as live comparables, never ranked: the market has
// already priced them, and their prices are what calibrate this model.
//
// Implied value follows only from the snapshot's own figures, in four factors:
//
//   peer multiple  the median market-cap / TVL ratio of the live-token protocols in the same
//                  DefiLlama category (each ratio winsorised to [0.02, 1.5] first, so one
//                  micro-cap outlier cannot price a whole category), shrunk toward the global
//                  live median with a prior weight that grows as the evidence thins: 4 for four
//                  or more peers, 8 for three, 10 for two, 16 for one. A category with no live
//                  peers takes the global median. The thinner the evidence, the harder the
//                  estimate reverts to the market as a whole.
//   size factor    the snapshot's own live set shows market-cap / TVL falling as TVL grows:
//                  the median ratio is 0.42 at $5-50M of TVL and 0.03 above $1B, a slope of
//                  about -0.34 per decade of TVL (recomputed from the snapshot on every run).
//                  Each row's multiple is therefore scaled by (tvl / median peer TVL) raised
//                  to that slope, clamped to [0.15, 1.5]: a $2.7B protocol is never priced at
//                  a multiple observed on $12M protocols, and a small one is never priced at
//                  a giant's multiple either.
//   growth         1 + clamp(change_7d, -60, 120) / 100 x 0.5: a week of TVL momentum, damped.
//   maturity       0.6 + min(age_days, 1095) / 1095 x 0.4: the longer a protocol has run with no
//                  token, the more of its record a launch would capitalise. Unknown age: 365.
//
//   implied = max(1, round(tvl_usd x peer_multiple x size_factor x growth x maturity))
//
// Every row also carries a confidence: High when four or more live peers price it and its size
// factor stays near 1, Medium at two or three peers, Low at one peer or none — and a row drops
// one level when its size factor falls below 0.5, because its price is then extrapolated far
// from the peers that set it. The detail view names the evidence: the peers, the largest live
// market cap in the category, and the risks. No protocol name is ever special-cased: one
// function scores every row, and the dashboard recomputes each row from the same figures and
// shows the board's number beside its own.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  prior_weight: number;
  prior_weight_3: number;
  prior_weight_2: number;
  prior_weight_1: number;
  ratio_floor: number;
  ratio_cap: number;
  multiple_floor: number;
  multiple_cap: number;
  size_factor_floor: number;
  size_factor_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  prior_weight: 4,
  prior_weight_3: 8,
  prior_weight_2: 10,
  prior_weight_1: 16,
  ratio_floor: 0.02,
  ratio_cap: 1.5,
  multiple_floor: 0.04,
  multiple_cap: 1.25,
  size_factor_floor: 0.15,
  size_factor_cap: 1.5,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the board carries it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live comparables view carries, by market cap. */
export const LIVE_ROWS = 36;

/** One category's calibration: how the snapshot's live protocols price a dollar of TVL. */
export interface PeerStat {
  category: string;
  peers: number;
  median_multiple: number;
  multiple: number;
  median_peer_tvl: number;
  max_live_mcap: number;
  max_live_mcap_name: string | null;
  peer_names: string[];
}

/** How much the model trusts one row's price: peer count, then how far its size is extrapolated. */
export type Confidence = 'High' | 'Medium' | 'Low';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  signals: string[];
  model: {
    peer_multiple: number;
    peer_count: number;
    size_factor: number;
    confidence: Confidence;
    peer_median_tvl: number;
    max_live_mcap: number;
    max_live_mcap_name: string | null;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  peer_multiple: number;
  peer_count: number;
  size_factor: number;
  confidence: Confidence;
  peer_median_tvl: number;
  max_live_mcap: number;
  max_live_mcap_name: string | null;
  growth_multiplier: number;
  maturity_multiplier: number;
  signals: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  size_beta: number;
  size_tiers: { band: string; n: number; median_ratio: number }[];
  peers: PeerStat[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are products of a token that already trades, never a launch of their own. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a product may begin with (the watchlist's own rule). */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A whole word wrapped, staked or staking in a name marks a product of another token. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * Whether a protocol is a wrapped, staked, bridged or versioned product of a token that already
 * trades (the watchlist's product rule, applied at every size): such a protocol is no launch
 * candidate, however large it is.
 */
export function isProduct(p: SnapshotProtocol): boolean {
  if (VERSIONED.test(p.name)) return true;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (PRODUCT_WORD.test(p.name)) return true;
  return EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x));
}

/** Whether a protocol is one the board may rank: pre-token and not a product of a live token. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isProduct(p);
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** The prior weight a category's median earns: the thinner the evidence, the harder the
 *  estimate reverts to the global median. One live peer cannot price a category. */
function priorWeight(peers: number, model: ModelConstants): number {
  if (peers <= 1) return model.prior_weight_1;
  if (peers === 2) return model.prior_weight_2;
  if (peers === 3) return model.prior_weight_3;
  return model.prior_weight;
}

/** The size slope: the ordinary-least-squares slope of log10(mcap/TVL) on log10(TVL) over the
 *  snapshot's live protocols, winsorised ratios, clamped to [-0.8, 0]. A slope near zero (too
 *  few live protocols, or no size pattern in the data) means no size adjustment at all. */
function sizeSlope(snapshot: Snapshot, model: ModelConstants): number {
  const points: [number, number][] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    points.push([Math.log10(p.tvl_usd), Math.log10(clamp(p.mcap_usd / p.tvl_usd, model.ratio_floor, model.ratio_cap))]);
  }
  if (points.length < 10) return 0;
  const mx = points.reduce((s, q) => s + q[0], 0) / points.length;
  const my = points.reduce((s, q) => s + q[1], 0) / points.length;
  let cov = 0;
  let vx = 0;
  for (const [x, y] of points) {
    cov += (x - mx) * (y - my);
    vx += (x - mx) * (x - mx);
  }
  if (vx === 0) return 0;
  const beta = clamp(cov / vx, -0.8, 0);
  return Math.abs(beta) < 0.05 ? 0 : round4(beta);
}

/** The median live mcap/TVL ratio by TVL band, the evidence the size slope stands on. */
function sizeTiers(snapshot: Snapshot, model: ModelConstants): { band: string; n: number; median_ratio: number }[] {
  const bands: [string, number, number][] = [
    ['$5M-$50M', 5_000_000, 50_000_000],
    ['$50M-$250M', 50_000_000, 250_000_000],
    ['$250M-$1B', 250_000_000, 1_000_000_000],
    ['$1B+', 1_000_000_000, Number.POSITIVE_INFINITY],
  ];
  return bands.map(([band, lo, hi]) => {
    const ratios = snapshot.protocols
      .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd >= lo && p.tvl_usd < hi)
      .map((p) => clamp(p.mcap_usd! / p.tvl_usd, model.ratio_floor, model.ratio_cap));
    return { band, n: ratios.length, median_ratio: ratios.length > 0 ? round4(median(ratios)) : 0 };
  });
}

/**
 * The calibration: for every category, the live-token protocols' market-cap / TVL ratios, their
 * median, and the multiple the model uses after shrinking toward the global median with a prior
 * weight set by the peer count, and clamping. Also the size slope and the median TVL of each
 * category's live peers, which the size factor is measured against. Deterministic: ratios are
 * gathered in snapshot order and medians are order-free.
 */
export function calibrate(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { global: number; peers: PeerStat[]; byCategory: Map<string, PeerStat>; beta: number; globalTvlMedian: number; tiers: { band: string; n: number; median_ratio: number }[] } {
  const ratiosByCategory = new Map<string, number[]>();
  const tvlByCategory = new Map<string, number[]>();
  const mcapByCategory = new Map<string, { name: string; mcap: number }[]>();
  const all: number[] = [];
  const allTvl: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    // Winsorised: one micro-cap outlier (a live peer at 400x its TVL) cannot price a whole
    // category; every ratio counts, but inside [ratio_floor, ratio_cap].
    const ratio = clamp(p.mcap_usd / p.tvl_usd, model.ratio_floor, model.ratio_cap);
    all.push(ratio);
    allTvl.push(p.tvl_usd);
    const key = p.category ?? 'Uncategorised';
    const list = ratiosByCategory.get(key);
    if (list === undefined) {
      ratiosByCategory.set(key, [ratio]);
      tvlByCategory.set(key, [p.tvl_usd]);
      mcapByCategory.set(key, [{ name: p.name, mcap: p.mcap_usd }]);
    } else {
      list.push(ratio);
      tvlByCategory.get(key)!.push(p.tvl_usd);
      mcapByCategory.get(key)!.push({ name: p.name, mcap: p.mcap_usd });
    }
  }
  const global = all.length > 0 ? median(all) : 0.2;
  const globalTvlMedian = allTvl.length > 0 ? median(allTvl) : 0;
  const peers: PeerStat[] = [];
  const byCategory = new Map<string, PeerStat>();
  for (const [category, ratios] of [...ratiosByCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const med = median(ratios);
    const w = priorWeight(ratios.length, model);
    const shrunk = (ratios.length * med + w * global) / (ratios.length + w);
    const mcaps = [...mcapByCategory.get(category)!].sort((a, b) => b.mcap - a.mcap);
    const stat: PeerStat = {
      category,
      peers: ratios.length,
      median_multiple: round4(med),
      multiple: round4(clamp(shrunk, model.multiple_floor, model.multiple_cap)),
      median_peer_tvl: Math.round(median(tvlByCategory.get(category)!)),
      max_live_mcap: mcaps[0]!.mcap,
      max_live_mcap_name: mcaps[0]!.name,
      peer_names: mcaps.slice(0, 3).map((m) => m.name),
    };
    peers.push(stat);
    byCategory.set(category, stat);
  }
  return { global: round4(global), peers, byCategory, beta: sizeSlope(snapshot, model), globalTvlMedian, tiers: sizeTiers(snapshot, model) };
}

/** The peer multiple one protocol is priced with, and the evidence behind it. */
function multipleFor(
  p: SnapshotProtocol,
  cal: { global: number; byCategory: Map<string, PeerStat>; globalTvlMedian: number },
): { multiple: number; peers: number; medianPeerTvl: number; maxLiveMcap: number; maxLiveMcapName: string | null; peerNames: string[] } {
  const stat = p.category === null ? undefined : cal.byCategory.get(p.category);
  if (stat === undefined) {
    return { multiple: cal.global, peers: 0, medianPeerTvl: cal.globalTvlMedian, maxLiveMcap: 0, maxLiveMcapName: null, peerNames: [] };
  }
  return {
    multiple: stat.multiple,
    peers: stat.peers,
    medianPeerTvl: stat.median_peer_tvl,
    maxLiveMcap: stat.max_live_mcap,
    maxLiveMcapName: stat.max_live_mcap_name,
    peerNames: stat.peer_names,
  };
}

/** A row's confidence: peer count first, then one level down when its price is extrapolated far
 *  in size from the peers that set it (size factor below 0.5). */
function confidenceFor(peers: number, sizeFactor: number): Confidence {
  let c: Confidence = peers >= 4 ? 'High' : peers >= 2 ? 'Medium' : 'Low';
  if (sizeFactor < 0.5 && c !== 'Low') c = c === 'High' ? 'Medium' : 'Low';
  return c;
}

/** The four factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  cal: { global: number; byCategory: Map<string, PeerStat>; beta: number; globalTvlMedian: number },
  model: ModelConstants,
): {
  implied: number;
  multiple: number;
  peers: number;
  sizeFactor: number;
  confidence: Confidence;
  medianPeerTvl: number;
  maxLiveMcap: number;
  maxLiveMcapName: string | null;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, peers, medianPeerTvl, maxLiveMcap, maxLiveMcapName } = multipleFor(protocol, cal);
  // The size factor: the snapshot's live set prices a dollar of TVL lower the larger the
  // protocol, so a row's multiple is scaled by (tvl / median peer TVL) raised to the size
  // slope, clamped so the adjustment never more than halves or 1.5x the multiple.
  const sizeFactor =
    cal.beta === 0 || medianPeerTvl <= 0 ? 1 : round4(clamp(Math.pow(protocol.tvl_usd / medianPeerTvl, cal.beta), model.size_factor_floor, model.size_factor_cap));
  const confidence = confidenceFor(peers, sizeFactor);
  const growthPct = clamp(finite(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * sizeFactor * growthMult * maturityMult));
  return { implied, multiple, peers, sizeFactor, confidence, medianPeerTvl, maxLiveMcap, maxLiveMcapName, growthPct, growthMult, maturityMult, age };
}

/** The short signal tags a row earns from its own figures: momentum, tenure, scale, evidence. */
export function signalsFor(p: SnapshotProtocol, age: number | null, watchlist: boolean, peers: number): string[] {
  const signals: string[] = [];
  if (watchlist) signals.push('Watchlist');
  if (p.change_7d !== null && p.change_7d >= 15) signals.push('Surging TVL');
  else if (p.change_7d !== null && p.change_7d >= 5) signals.push('Rising TVL');
  else if (p.change_7d !== null && p.change_7d <= -15) signals.push('Cooling TVL');
  if (age !== null && age >= 730) signals.push('2y+ tokenless');
  if (p.chains.length >= 5) signals.push('Multichain');
  if (peers <= 1) signals.push('Thin evidence');
  return signals;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const onWatchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the product rule would set aside (there is
  // none on this snapshot, but coverage is the gate's row and is never gambled on a rule change).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, at every size. The floor is where
  // the house's reading started; a radar that stops there finds nothing early.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const cal = calibrate(snapshot, model);
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, cal, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: onWatchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    signals: signalsFor(s.p, s.age, onWatchlist.has(s.p.slug), s.peers),
    model: {
      peer_multiple: s.multiple,
      peer_count: s.peers,
      size_factor: s.sizeFactor,
      confidence: s.confidence,
      peer_median_tvl: s.medianPeerTvl,
      max_live_mcap: s.maxLiveMcap,
      max_live_mcap_name: s.maxLiveMcapName,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain: mainnet gas, an L2's cents, Solana's fraction of a cent. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $8 of mainnet gas';
  if (chain === 'Solana') return 'under $0.10 of fees';
  if (['Base', 'Arbitrum', 'Optimism', 'Ink', 'Linea', 'Scroll', 'zkSync Era', 'Mode', 'Blast', 'Mantle'].includes(chain)) return 'about $0.30 of L2 gas';
  if (chain === 'Polygon' || chain === 'Binance' || chain === 'BSC' || chain === 'Avalanche' || chain === 'Tron') return 'about $0.20 of gas';
  return 'about $1 of gas';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 250_000_000) return 100;
  if (p.tvl_usd >= 50_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's two working actions: what a farmer actually does in this kind of protocol.
 *  The second action uses the protocol's second chain when it has one, so a multichain
 *  protocol is farmed on two chains, not one twice. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string, chain2: string | null): [string, string] {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const other = chain2 ?? chain;
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator'))
    return [
      `Deposit $${capital} of USDC into a ${name} curated vault on ${chain} and keep the vault shares in the wallet.`,
      `Split a second $${Math.round(capital / 2)} into a different ${name} vault on ${other} so the position is not riding on one strategy or one chain.`,
    ];
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return [
      `Supply $${capital} of USDC to ${name} on ${chain} and leave the supplied balance untouched.`,
      `Borrow about $${Math.round(capital / 3)} against the supply on ${other}, swap it back to USDC and re-supply it once, then stop: one loop is activity, more is leverage risk.`,
    ];
  if (c.includes('dex') || c.includes('derivative') || c.includes('perpetual'))
    return [
      `Trade $${capital} of volume on ${name} on ${chain}, in a few swaps across different days rather than one block.`,
      `Provide $${Math.round(capital / 2)} of liquidity to ${name}'s main pool on ${other} and keep the position open between sessions.`,
    ];
  if (c.includes('yield'))
    return [
      `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and keep the receipt token.`,
      `Claim and re-deposit the yield once on ${other}, so the wallet shows both a claim and a second deposit.`,
    ];
  if (c.includes('rwa'))
    return [
      `Complete ${name}'s onboarding on ${chain} and mint $${capital} of its yield asset.`,
      `Hold the minted asset and make one small second mint of $${Math.round(capital / 4)} on ${other} a few weeks later.`,
    ];
  if (c.includes('basis') || c.includes('stable'))
    return [
      `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the wallet.`,
      `Use the stable asset once inside ${name} on ${other}: a swap, a supply or a redemption quote you actually settle.`,
    ];
  if (c.includes('prediction'))
    return [
      `Fund $${capital} and take one position in a liquid market on ${name}.`,
      `Settle the position at resolution and take a second, smaller position the following week.`,
    ];
  if (c.includes('chain'))
    return [
      `Bridge $${capital} of USDC to the ${name} chain and make the wallet's first transactions there.`,
      `Use two native apps on the chain in the same week, so the wallet reads as a resident, not a passer-by.`,
    ];
  if (c.includes('staking') || c.includes('restak'))
    return [
      `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`,
      `Claim staking rewards once and restake them, so the wallet shows a full staking cycle.`,
    ];
  return [
    `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    `Make one second, smaller deposit of $${Math.round(capital / 2)} on ${other} two weeks later, so the wallet shows returning activity.`,
  ];
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age, seven-day momentum), never from a
 * hand-written list of names: the same derivation writes board.json and renders the dashboard's
 * detail view. A surging protocol is farmed while the window is open but sized small; a cooling
 * one is entered at half size; a young one is checked before the hold; a giant one is farmed for
 * activity, not size, and a small one for a meaningful share.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const chain2 = p.chains.length >= 2 ? p.chains[1]! : null;
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const [first, second] = actionsFor(p, capital, chain, chain2);
  const tierNote =
    p.tvl_usd >= 1_000_000_000
      ? ` At $${Math.round(p.tvl_usd / 1_000_000_000)}B of TVL this position is about activity, not size: a $${capital} deposit is a rounding error, so make it clean.`
      : p.tvl_usd < 50_000_000
        ? ` At $${Math.round(p.tvl_usd / 1_000_000)}M of TVL a $${capital} position is a meaningful share, so watch for the points program to open.`
        : '';
  const momentum =
    p.change_7d !== null && p.change_7d >= 15
      ? `TVL is surging (+${p.change_7d.toFixed(1)}% in a week): repeat the qualifying action twice this week while the window is open, but keep each deposit small — hot money leaves as fast as it arrives.`
      : p.change_7d !== null && p.change_7d <= -15
        ? `TVL is cooling (${p.change_7d.toFixed(1)}% in a week): enter with half the planned capital and add the rest only if next week's TVL steadies.`
        : `Repeat one qualifying action every week on the same weekday: a deposit, a swap, a claim or a vote inside ${p.name}.`;
  const holdNote =
    age !== null && age < 180
      ? `Hold the position for at least ${hold} days, and read ${p.name}'s docs and audit note before the hold: a young protocol is checked before it is trusted.`
      : age !== null && age >= 730
        ? `Hold the position for at least ${hold} days: two years tokenless means the launch, if it comes, rewards the long holders, so stay through the next quarter.`
        : `Hold the position for at least ${hold} days so the activity spans more than one weekly snapshot of the protocol.`;
  return [
    {
      text: `Open a fresh wallet for ${p.name} alone, fund it from an exchange withdrawal, and keep its seed phrase offline on paper.`,
      cost: 'the withdrawal fee only, and never pay anyone to set a wallet up',
      time: '10 minutes',
    },
    {
      text: `${first}${tierNote}`,
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: second,
      cost: `${gas} again, no new capital beyond the $${Math.round(capital / 2)} named`,
      time: '10 minutes',
    },
    {
      text: momentum,
      cost: 'about the same gas each week, under $10 a month on most chains',
      time: '10 minutes a week',
    },
    {
      text: holdNote,
      cost: `the $${capital} stays in the position and cannot be spent meanwhile`,
      time: `${hold} days`,
    },
    {
      text: `Check ${p.name}'s own points or rewards page from the link on its official site, and claim only there; a claim never asks for a fee or a seed phrase.`,
      cost: 'nothing to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Log the wallet, the dates and every transaction hash in a farm log, and set a monthly reminder to repeat or unwind the position.`,
      cost: 'nothing but the log itself',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live comparables view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: row.watchlist,
    implied_value_usd: row.implied_value_usd,
    peer_multiple: row.model.peer_multiple,
    peer_count: row.model.peer_count,
    size_factor: row.model.size_factor,
    confidence: row.model.confidence,
    peer_median_tvl: row.model.peer_median_tvl,
    max_live_mcap: row.model.max_live_mcap,
    max_live_mcap_name: row.model.max_live_mcap_name,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    signals: row.signals,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const cal = calibrate(snapshot, model);
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: cal.global,
    size_beta: cal.beta,
    size_tiers: cal.tiers,
    peers: cal.peers,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows: the gate asks for at least 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

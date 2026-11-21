// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, a filterable and sortable table, a live-token comparables view, a model sandbox
// and a per-protocol detail view with the model's own arithmetic and the protocol's farm plan.
// No network: every byte it shows is in data.js. The model functions below are the same derivation
// lib/model.ts writes into board.json, so the page recomputes each row and shows its number beside
// the board's: if they ever disagreed, the detail view would say so.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var M = DATA.model;
  var state = { q: '', category: 'all', chain: 'all', watch: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var box = { scale: 1, growth: M.growth_weight, maturity: M.maturity_range };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  // The model in one function: a row's implied value from the snapshot figures alone. With the
  // model's own constants it reproduces board.json exactly; the sandbox passes its own. The
  // size factor is part of the filed model, so it stays in both the board's number and the
  // sandbox's: only the scale, growth and maturity levers move.
  function impliedOf(row, growthWeight, maturityRange, scale) {
    var growth = clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, M.growth_floor, M.growth_cap);
    var growthMult = 1 + (growth / 100) * growthWeight;
    var age = row.age_days === null || row.age_days === undefined ? M.unknown_age_days : row.age_days;
    var maturity = M.maturity_floor + (clamp(age, 0, M.maturity_days) / M.maturity_days) * maturityRange;
    return Math.max(1, Math.round(row.tvl_usd * row.peer_multiple * row.size_factor * scale * growthMult * maturity));
  }
  function boardImplied(row) { return impliedOf(row, M.growth_weight, M.maturity_range, 1); }
  function sandboxActive() { return box.scale !== 1 || box.growth !== M.growth_weight || box.maturity !== M.maturity_range; }
  function shownImplied(row) { return sandboxActive() ? impliedOf(row, box.growth, box.maturity, box.scale) : row.implied_value_usd; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL,
  // age and seven-day momentum decide the actions, the capital, the gas and the hold. No name
  // is special-cased. A surging protocol is farmed while the window is open but sized small; a
  // cooling one is entered at half size; a young one is checked before the hold; a giant one
  // is farmed for activity, not size, and a small one for a meaningful share.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    if (chain === 'Ethereum') return 'about $8 of mainnet gas';
    if (chain === 'Solana') return 'under $0.10 of fees';
    if (['Base', 'Arbitrum', 'Optimism', 'Ink', 'Linea', 'Scroll', 'zkSync Era', 'Mode', 'Blast', 'Mantle'].indexOf(chain) >= 0) return 'about $0.30 of L2 gas';
    if (['Polygon', 'Binance', 'BSC', 'Avalanche', 'Tron'].indexOf(chain) >= 0) return 'about $0.20 of gas';
    return 'about $1 of gas';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 2.5e8) return 100;
    if (p.tvl_usd >= 5e7) return 75;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionsFor(p, capital, chain, chain2) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var other = chain2 || chain;
    if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return [
      'Deposit $' + capital + ' of USDC into a ' + name + ' curated vault on ' + chain + ' and keep the vault shares in the wallet.',
      'Split a second $' + Math.round(capital / 2) + ' into a different ' + name + ' vault on ' + other + ' so the position is not riding on one strategy or one chain.'];
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return [
      'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and leave the supplied balance untouched.',
      'Borrow about $' + Math.round(capital / 3) + ' against the supply on ' + other + ', swap it back to USDC and re-supply it once, then stop: one loop is activity, more is leverage risk.'];
    if (c.indexOf('dex') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return [
      'Trade $' + capital + ' of volume on ' + name + ' on ' + chain + ', in a few swaps across different days rather than one block.',
      "Provide $" + Math.round(capital / 2) + " of liquidity to " + name + "'s main pool on " + other + ' and keep the position open between sessions.'];
    if (c.indexOf('yield') >= 0) return [
      "Deposit $" + capital + " of USDC into " + name + "'s main vault on " + chain + ' and keep the receipt token.',
      'Claim and re-deposit the yield once on ' + other + ', so the wallet shows both a claim and a second deposit.'];
    if (c.indexOf('rwa') >= 0) return [
      "Complete " + name + "'s onboarding on " + chain + ' and mint $' + capital + ' of its yield asset.',
      'Hold the minted asset and make one small second mint of $' + Math.round(capital / 4) + ' on ' + other + ' a few weeks later.'];
    if (c.indexOf('basis') >= 0 || c.indexOf('stable') >= 0) return [
      'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it in the wallet.',
      'Use the stable asset once inside ' + name + ' on ' + other + ': a swap, a supply or a redemption quote you actually settle.'];
    if (c.indexOf('prediction') >= 0) return [
      'Fund $' + capital + ' and take one position in a liquid market on ' + name + '.',
      'Settle the position at resolution and take a second, smaller position the following week.'];
    if (c.indexOf('chain') >= 0) return [
      'Bridge $' + capital + ' of USDC to the ' + name + ' chain and make the wallet\'s first transactions there.',
      'Use two native apps on the chain in the same week, so the wallet reads as a resident, not a passer-by.'];
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return [
      "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.',
      'Claim staking rewards once and restake them, so the wallet shows a full staking cycle.'];
    return [
      'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.',
      'Make one second, smaller deposit of $' + Math.round(capital / 2) + ' on ' + other + ' two weeks later, so the wallet shows returning activity.'];
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var chain2 = p.chains && p.chains.length >= 2 ? p.chains[1] : null;
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var acts = actionsFor(p, capital, chain, chain2);
    var tierNote = p.tvl_usd >= 1e9
      ? ' At $' + Math.round(p.tvl_usd / 1e9) + 'B of TVL this position is about activity, not size: a $' + capital + ' deposit is a rounding error, so make it clean.'
      : p.tvl_usd < 5e7
        ? ' At $' + Math.round(p.tvl_usd / 1e6) + 'M of TVL a $' + capital + ' position is a meaningful share, so watch for the points program to open.'
        : '';
    var momentum = p.change_7d !== null && p.change_7d !== undefined && p.change_7d >= 15
      ? 'TVL is surging (+' + p.change_7d.toFixed(1) + '% in a week): repeat the qualifying action twice this week while the window is open, but keep each deposit small \u2014 hot money leaves as fast as it arrives.'
      : p.change_7d !== null && p.change_7d !== undefined && p.change_7d <= -15
        ? 'TVL is cooling (' + p.change_7d.toFixed(1) + '% in a week): enter with half the planned capital and add the rest only if next week\'s TVL steadies.'
        : 'Repeat one qualifying action every week on the same weekday: a deposit, a swap, a claim or a vote inside ' + p.name + '.';
    var holdNote = p.age_days !== null && p.age_days !== undefined && p.age_days < 180
      ? 'Hold the position for at least ' + hold + ' days, and read ' + p.name + '\'s docs and audit note before the hold: a young protocol is checked before it is trusted.'
      : p.age_days !== null && p.age_days !== undefined && p.age_days >= 730
        ? 'Hold the position for at least ' + hold + ' days: two years tokenless means the launch, if it comes, rewards the long holders, so stay through the next quarter.'
        : 'Hold the position for at least ' + hold + ' days so the activity spans more than one weekly snapshot of the protocol.';
    return [
      { text: 'Open a fresh wallet for ' + p.name + ' alone, fund it from an exchange withdrawal, and keep its seed phrase offline on paper.', cost: 'the withdrawal fee only, and never pay anyone to set a wallet up', time: '10 minutes' },
      { text: acts[0] + tierNote, cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: acts[1], cost: gas + ' again, no new capital beyond the $' + Math.round(capital / 2) + ' named', time: '10 minutes' },
      { text: momentum, cost: 'about the same gas each week, under $10 a month on most chains', time: '10 minutes a week' },
      { text: holdNote, cost: 'the $' + capital + ' stays in the position and cannot be spent meanwhile', time: hold + ' days' },
      { text: "Check " + p.name + "'s own points or rewards page from the link on its official site, and claim only there; a claim never asks for a fee or a seed phrase.", cost: 'nothing to check, and never pay to claim', time: '10 minutes' },
      { text: 'Log the wallet, the dates and every transaction hash in a farm log, and set a monthly reminder to repeat or unwind the position.', cost: 'nothing but the log itself', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('watch') === '1') state.watch = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watch) params.set('watch', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.peer_multiple; bv = b.peer_multiple; }
      else { av = shownImplied(a); bv = shownImplied(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var total = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, DATA.board_size + ' protocols with no token on record, ', el('span', { class: 'hl', text: 'ranked by what a launch would be worth' })),
        el('p', { text: 'Every protocol here records no token. Each is priced by the snapshot itself: the market-cap-to-TVL multiple of the live-token protocols in its own category, scaled by size — big protocols are priced at the lower multiples big live protocols actually trade at — then its seven-day TVL momentum and how long it has run tokenless. Every row carries a confidence: how many live peers price it, and how far its size is extrapolated from them. The watchlist of ' + DATA.watchlist_size + ' is the floor, not the ceiling: the radar also ranks ' + DATA.early_size + ' early protocols below the $' + Math.round(DATA.floor_usd / 1e6) + 'M line. Implied value is this board\u2019s own model, never a promise, and it does not say whether or when a token will be issued.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(total) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live tokens set aside' }), el('b', { text: String(DATA.live_size) + ' shown' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function select(id, label, values, current, onChange) {
      var sel = el('select', { id: id, 'aria-label': label },
        el('option', { value: 'all', text: label === 'Category' ? 'All categories' : 'All chains' }),
        values.map(function (v) { return el('option', { value: v, text: v, selected: v === current ? 'selected' : null }); })
      );
      sel.addEventListener('change', function () { onChange(sel.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), sel);
    }
    var watchBox = el('input', { type: 'checkbox', id: 'watch', checked: state.watch ? 'checked' : null });
    watchBox.addEventListener('change', function () { state.watch = watchBox.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live comparables', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      select('category', 'Category', categories, state.category, function (v) { state.category = v; }),
      select('chain', 'Chain', chains, state.chain, function (v) { state.chain = v; }),
      el('div', { class: 'field check' }, watchBox, el('label', { for: 'watch', text: 'Watchlist only' })),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.board_size + ' rows' + (sandboxActive() ? ' \u00b7 sandbox on' : '') : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }
  function chips(r) {
    if (!r.signals || r.signals.length === 0) return null;
    return el('span', { class: 'chips' }, r.signals.map(function (s) {
      var cls = s.indexOf('Surging') === 0 || s.indexOf('Rising') === 0 ? 'chip hot' : s.indexOf('Cooling') === 0 ? 'chip cool' : s.indexOf('Thin') === 0 ? 'chip thin' : 'chip';
      return el('span', { class: cls, text: s });
    }));
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watch = false; writeHash(); render(); } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { max = Math.max(max, shownImplied(r)); });
    max = max || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') }),
          chips(r)
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: r.peer_multiple.toFixed(2) + '\u00d7' }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((shownImplied(r) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(shownImplied(r)) })
        )),
        el('td', null, el('span', { class: r.watchlist ? 'status watch' : 'status', text: r.watchlist ? 'watchlist' : 'early' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols ranked by implied value. Select a row for its model breakdown and farm plan.' + (sandboxActive() ? ' The sandbox is on: values and order are the sandbox\u2019s; ranks stay the board\u2019s.' : '') }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Peer \u00d7'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'List' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.multiple === null ? 'n/a' : r.multiple.toFixed(2) + '\u00d7' }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Live comparables: these protocols already trade, so their market cap is a fact, not a model. Their market-cap-to-TVL multiples, grouped by category, are the calibration the pre-token board is priced with.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'MCap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function slider(label, min, max, step, value, fmt, onInput) {
    var out = el('output', { text: fmt(value) });
    var input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
    input.addEventListener('input', function () { var v = parseFloat(input.value); out.textContent = fmt(v); onInput(v); render(); });
    return el('div', { class: 'slider' }, el('span', { text: label }), input, out);
  }

  function sandboxPanel() {
    return el('section', { class: 'panel box' },
      el('h2', { text: 'Model sandbox' }),
      el('p', { class: 'sub', text: 'Stress the board\u2019s three levers and watch it re-rank. The board\u2019s own ranks never change: this is a what-if on the same figures, and the detail view always verifies against the filed model.' }),
      slider('Peer \u00d7 scale', 0.25, 3, 0.05, box.scale, function (v) { return v.toFixed(2) + '\u00d7'; }, function (v) { box.scale = v; }),
      slider('Growth weight', 0, 1, 0.05, box.growth, function (v) { return v.toFixed(2); }, function (v) { box.growth = v; }),
      slider('Maturity range', 0, 0.8, 0.05, box.maturity, function (v) { return v.toFixed(2); }, function (v) { box.maturity = v; }),
      el('p', { class: 'sub', text: sandboxActive() ? 'Sandbox on: the table shows sandbox values in board order levers applied.' : 'At the filed settings: scale 1.00\u00d7, growth weight ' + M.growth_weight + ', maturity range ' + M.maturity_range + '.' })
    );
  }

  function modelPanel() {
    var onBoard = {};
    DATA.rows.forEach(function (r) { onBoard[r.category || 'Uncategorised'] = true; });
    var peerRows = DATA.peers.filter(function (s) { return onBoard[s.category]; });
    var tbody = el('tbody');
    peerRows.forEach(function (s) {
      tbody.appendChild(el('tr', null,
        el('td', { text: s.category }),
        el('td', { class: 'num', text: String(s.peers) }),
        el('td', { class: 'num', text: s.median_multiple.toFixed(2) + '\u00d7' }),
        el('td', { class: 'num', text: s.multiple.toFixed(2) + '\u00d7' }),
        el('td', { class: 'num', text: fmtUsd(s.median_peer_tvl) }),
        el('td', { class: 'num', text: s.max_live_mcap_name ? s.max_live_mcap_name + ' ' + fmtUsd(s.max_live_mcap) : 'n/a' })
      ));
    });
    var tierText = DATA.size_tiers.map(function (t) { return t.band + ' TVL: ' + t.n + ' live, median ' + t.median_ratio.toFixed(2) + '\u00d7'; }).join('; ');
    return el('section', { class: 'panel box' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function of the snapshot\u2019s own figures scores every row. No protocol name is special-cased and no row is hand-picked.' }),
      el('div', { class: 'formula', text: 'implied = round( tvl \u00d7 peer_multiple \u00d7 size_factor \u00d7 (1 + clamp(7d, ' + M.growth_floor + ', ' + M.growth_cap + ')/100 \u00d7 ' + M.growth_weight + ') \u00d7 (' + M.maturity_floor + ' + min(age, ' + M.maturity_days + ')/' + M.maturity_days + ' \u00d7 ' + M.maturity_range + ') )' }),
      el('p', { text: 'The peer multiple is the median market-cap / TVL of the category\u2019s live-token protocols, each ratio winsorised to [' + M.ratio_floor + ', ' + M.ratio_cap + '] so one micro-cap outlier cannot price a category, then shrunk toward the global live median of ' + DATA.global_multiple.toFixed(2) + '\u00d7 with a prior weight that grows as the evidence thins (' + M.prior_weight + ' for four or more peers, ' + M.prior_weight_3 + ' for three, ' + M.prior_weight_2 + ' for two, ' + M.prior_weight_1 + ' for one) and clamped to [' + M.multiple_floor + ', ' + M.multiple_cap + ']. A category with no live peers is priced at the global median. One live peer cannot price a category: its multiple is mostly the market as a whole.' }),
      el('p', { text: 'The size factor is the snapshot\u2019s own evidence that a dollar of TVL is worth less the larger the protocol: live market-cap / TVL falls with TVL at a slope of ' + DATA.size_beta.toFixed(2) + ' per decade (median ratios — ' + tierText + '). Each row\u2019s multiple is scaled by (tvl / median peer TVL) raised to that slope, clamped to [' + M.size_factor_floor + ', ' + M.size_factor_cap + ']. A $2.7B protocol is never priced at a multiple observed on $12M protocols.' }),
      el('p', { text: 'Confidence follows the evidence: High at four or more live peers, Medium at two or three, Low at one or none — and a row drops one level when its size factor falls below 0.5, because its price is then extrapolated far from the peers that set it. The board ranks every protocol that records no token and is not a wrapped, staked, bridged or versioned product of one that trades \u2014 the watchlist rule applied at every size, which is why ' + DATA.early_size + ' rows sit below the watchlist floor. Age is the time since DefiLlama first tracked the protocol: how long it has run with no token. An unrecorded age counts as ' + M.unknown_age_days + ' days.' }),
      el('div', { class: 'peers' },
        el('table', null,
          el('caption', { class: 'sub', text: 'The calibration, for the categories on this board' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live peers' }), el('th', { scope: 'col', text: 'Median' }), el('th', { scope: 'col', text: 'Used' }), el('th', { scope: 'col', text: 'Peer TVL' }), el('th', { scope: 'col', text: 'Largest live' }))),
          tbody
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.age_days);
    var recomputed = boardImplied(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' \u00b7 on the watchlist' : ' \u00b7 early, below the watchlist floor') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' \u00b7 ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' \u00b7 records no token' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value, factor by factor' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Peer multiple (' + (row.category || 'uncategorised') + ', ' + row.peer_count + ' live peer' + (row.peer_count === 1 ? '' : 's') + ')' }), el('b', { class: 'num', text: row.peer_multiple.toFixed(3) + '\u00d7' })),
        el('div', null, el('span', { text: 'Size factor (TVL vs median peer)' }), el('b', { class: 'num', text: row.size_factor.toFixed(3) + '\u00d7' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: row.growth_multiplier.toFixed(3) + '\u00d7' })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: row.maturity_multiplier.toFixed(3) + '\u00d7' })),
        el('div', null, el('span', { text: 'Confidence' }), el('b', { class: 'num ' + (row.confidence === 'High' ? 'conf-high' : row.confidence === 'Medium' ? 'conf-med' : 'conf-low'), text: row.confidence })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub verify', text: 'Model ' + DATA.model_version + ': this page recomputes the row from the snapshot figures as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ' \u2014 the same number the board carries.' : ' \u2014 which differs from the board, so the data would be stale.') + ' An implied value is what a token would be worth if this record stayed as it is; it is not a prediction that one will be issued.' })
    ));
    var risks = [];
    if (row.peer_count <= 1) risks.push('Priced off ' + (row.peer_count === 1 ? 'a single live peer' : 'no live peer') + ' in ' + (row.category || 'its category') + (row.max_live_mcap_name ? ' (' + row.max_live_mcap_name + ', ' + fmtUsd(row.max_live_mcap) + ' market cap)' : '') + ': the multiple reverts most of the way to the global median of ' + DATA.global_multiple.toFixed(2) + '\u00d7, and the row is marked Low confidence.');
    if (row.size_factor < 0.5) risks.push('TVL is ' + Math.round(row.tvl_usd / row.peer_median_tvl) + '\u00d7 the median live peer\u2019s TVL (' + fmtUsd(row.peer_median_tvl) + '), so the size slope cuts the multiple to ' + row.size_factor.toFixed(2) + '\u00d7 \u2014 the price is extrapolated far from the peers that set it.');
    if (row.change_7d !== null && row.change_7d <= -15) risks.push('TVL is cooling (' + row.change_7d.toFixed(1) + '% in a week): the farm plan enters at half size until the next week steadies.');
    if (row.age_days !== null && row.age_days < 180) risks.push('Young protocol (' + row.age_days + ' days tracked): the farm plan reads its docs and audit note before the hold.');
    if (row.max_live_mcap > 0) risks.push('Largest live comparable in ' + (row.category || 'its category') + ': ' + row.max_live_mcap_name + ' at ' + fmtUsd(row.max_live_mcap) + ' market cap, against this row\u2019s ' + fmtUsd(row.implied_value_usd) + ' implied value.');
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Evidence and limits' }),
      el('ul', { class: 'risks' }, risks.map(function (t) { return el('li', { text: t }); }))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('div', { class: 'plan-total', text: 'Capital at work: $' + capital + ' \u00b7 setup about 35 minutes \u00b7 upkeep 10 minutes a week \u00b7 hold at least ' + hold + ' days \u00b7 gas depends on ' + chainOf(row) + ' (' + gasFor(chainOf(row)) + ' a transaction)' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') {
      shell.appendChild(boardTable());
      shell.appendChild(el('div', { class: 'grid2' }, sandboxPanel(), modelPanel()));
    } else {
      shell.appendChild(liveTable());
    }
    shell.appendChild(el('footer', { text: 'Data: ' + DATA.source + '. The board\u2019s implied values are its own model\u2019s claims, computed from that snapshot alone; a protocol records no token is a statement about the record, never proof that none exists.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();

import { Tile } from '@/types';
import {
  isMenzen,
  checkTenpai,
  canRonConcealed,
  getWaits,
  isFuriten,
  type NakiOption,
} from '@/gameLogic';
import type { State } from '@/game/gameState';
import {
  applyCallNaki,
  applyCallRon,
  applyDeclareTsumo,
  applyPassNaki,
  applyPassTsumo,
  applyPlayerDiscard,
  applyPlayerDraw,
  applyPlayerNakiDiscard,
  applyCpuTurn,
} from '@/game/transitions';
import { scoreHand } from '@/game/scoreAdapter';

export type SolverAction =
  | { type: 'draw' }
  | { type: 'cpu-turn' }
  | { type: 'discard'; tile: Tile; riichi?: boolean }
  | { type: 'call-naki'; option: NakiOption }
  | { type: 'pass-tsumo' }
  | { type: 'pass-naki' }
  | { type: 'tsumo'; riichi: boolean; lastMomentRiichi: boolean; score: number }
  | { type: 'ron'; tile: Tile; riichi: boolean; lastMomentRiichi: boolean; score: number };

export interface SolverResult {
  /** False when the input state is outside this closed-hand solver's scope. */
  supported: boolean;
  unsupportedReason?: 'open-hand';
  /** Final result: wins outrank tenpai, which outranks noten. Null means unsupported or incomplete. */
  outcome: 'win' | 'tenpai' | 'noten' | null;
  /** Best score for the player. Null means no winning line was found. */
  bestScore: number | null;
  /** One maximum-score line. Other equally scoring lines are not enumerated yet. */
  line: SolverAction[];
  complete: boolean;
  stats: {
    statesVisited: number;
    cacheHits: number;
    elapsedMs: number;
  };
}

export interface SolverOptions {
  /** Safety limit for the first prototype. An incomplete search never claims an answer. */
  maxStates?: number;
  /** Safety time limit for the first prototype. An incomplete search never claims an answer. */
  maxDurationMs?: number;
}

type StepAction = Extract<
  SolverAction,
  { type: 'draw' | 'cpu-turn' | 'discard' | 'call-naki' | 'pass-tsumo' | 'pass-naki' }
>;
type WinAction = Extract<SolverAction, { type: 'tsumo' | 'ron' }>;

interface OptionDescriptor {
  type: NakiOption['type'];
  tiles: string[];
  calledTile: string;
}

type StepDescriptor =
  | { type: 'draw' }
  | { type: 'cpu-turn' }
  | { type: 'discard'; tileKey: string }
  | { type: 'call-naki'; option: OptionDescriptor }
  | { type: 'pass-tsumo' }
  | { type: 'pass-naki' };

type WinDescriptor =
  | { type: 'tsumo'; riichi: boolean; lastMomentRiichi: boolean; score: number }
  | { type: 'ron'; tileKey: string; riichi: boolean; lastMomentRiichi: boolean; score: number };

type SearchChoice =
  | { kind: 'step'; action: StepDescriptor }
  | { kind: 'win'; action: WinDescriptor }
  | { kind: 'cpu-turn-ron'; win: Extract<WinDescriptor, { type: 'ron' }> };

interface SearchNode {
  /** 2 = win, 1 = tenpai at exhaustion, 0 = noten/no valid win. */
  rank: 0 | 1 | 2;
  score: number | null;
  /** Semantic action descriptor; contains no physical tile IDs. */
  choice?: SearchChoice;
}

function tileKey(tile: Tile): string {
  return `${tile.suit}-${tile.value}-${tile.isRed ? 1 : 0}`;
}

function furitenTileKey(tile: Tile): string {
  return `${tile.suit}-${tile.value}`;
}

function uniqueTiles(tiles: Tile[]): Tile[] {
  const seen = new Set<string>();
  return tiles.filter((tile) => {
    const key = tileKey(tile);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


/**
 * Optimistic reverse feasibility test: could ANY winning 14-tile hand be
 * assembled from the supplied optimistic tile pool?
 * The caller allows only the player's future draws plus at most one CPU discard.
 * False therefore proves that no winning continuation exists.
 * Also admits chiitoitsu and kokushi, not just four melds plus a pair.
 */
function couldBuildWinningHand(pool: Tile[]): boolean {
  const counts = Array<number>(34).fill(0);
  for (const tile of pool) {
    const group = tile.suit === 'man' ? 0 : tile.suit === 'pin' ? 9
      : tile.suit === 'sou' ? 18 : tile.suit === 'wind' ? 27 : 31;
    const index = group + tile.value - 1;
    if (index >= 0 && index < 34) counts[index]++;
  }
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total < 14) return false;

  const pairs = counts.filter(n => n >= 2).length;
  if (pairs >= 7) return true;

  const orphans = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  if (orphans.every(i => counts[i] >= 1) && orphans.some(i => counts[i] >= 2)) return true;

  // Explore all possible meld compositions, not just a single partition.
  // The memo key includes the remaining supply and number of melds required.
  const memo = new Map<string, boolean>();
  const meldsPossible = (needed: number): boolean => {
    if (needed === 0) return true;
    const key = needed + ':' + counts.join(',');
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    for (let i = 0; i < 34; i++) {
      if (counts[i] >= 3) {
        counts[i] -= 3;
        const possible = meldsPossible(needed - 1);
        counts[i] += 3;
        if (possible) { memo.set(key, true); return true; }
      }
      if (i < 27 && i % 9 <= 6 && counts[i] && counts[i+1] && counts[i+2]) {
        counts[i]--; counts[i+1]--; counts[i+2]--;
        const possible = meldsPossible(needed - 1);
        counts[i]++; counts[i+1]++; counts[i+2]++;
        if (possible) { memo.set(key, true); return true; }
      }
    }
    memo.set(key, false);
    return false;
  };
  for (let i = 0; i < 34; i++) {
    if (counts[i] < 2) continue;
    counts[i] -= 2;
    const possible = meldsPossible(4);
    counts[i] += 2;
    if (possible) return true;
  }
  return false;
}

function optionDescriptor(option: NakiOption): OptionDescriptor {
  return {
    type: option.type,
    tiles: option.tiles.map(tileKey).sort(),
    calledTile: tileKey(option.calledTile),
  };
}

function optionKey(option: NakiOption): string {
  return JSON.stringify(optionDescriptor(option));
}

function optionDescriptorKey(option: OptionDescriptor): string {
  return JSON.stringify(option);
}

/**
 * Semantic DP key: identical tile faces are interchangeable unless they are
 * red fives. This lets paths that differ only by physical copy IDs share work.
 * Only fields that affect future legal actions or scoring are included.
 */
function stateKey(state: State): string {
  return JSON.stringify({
    phase: state.phase,
    playerHand: state.playerHand.map(tileKey).sort(),
    playerDrawnTile: state.playerDrawnTile ? tileKey(state.playerDrawnTile) : null,
    // Within one search, fullWall is immutable and wall remains a contiguous
    // slice of it: top draws advance wallDrawnCount; each kan trims the end.
    // Encode that slice by its indices instead of serializing up to 96 tiles.
    wallStart: state.wallDrawnCount,
    wallEnd: state.wallDrawnCount + state.wall.length,
    wanpai: state.wanpai.map(tileKey),
    playerDiscards: [...new Set(state.playerDiscards.map(furitenTileKey))].sort(),
    playerFuro: state.playerFuro.map((furo) => ({
      type: furo.type,
      tiles: furo.tiles.map(tileKey),
      calledTile: tileKey(furo.calledTile),
    })),
    turnCount: state.turnCount,
    lastCpuDiscard: state.lastCpuDiscard ? tileKey(state.lastCpuDiscard) : null,
    // nakiOptions are derived from the hand, current discard, and riichi state.
    ronAvailable: state.ronAvailable,
    winType: state.winType,
    doraCount: state.doraCount,
    isRiichi: state.isRiichi,
    tsumoAvailable: state.tsumoAvailable,
    missedRonAfterRiichi: state.missedRonAfterRiichi,
    roundWind: state.roundWind,
    playerWind: state.playerWind,
    winTile: state.winTile ? tileKey(state.winTile) : null,
    isIppatsu: state.isIppatsu,
  });
}

function memoKey(state: State, lastDrawWasKan: boolean): string {
  return `${stateKey(state)}|lastDrawWasKan:${lastDrawWasKan ? 1 : 0}`;
}

function describeStep(action: StepAction): StepDescriptor {
  switch (action.type) {
    case 'draw':
      return { type: 'draw' };
    case 'cpu-turn':
      return { type: 'cpu-turn' };
    case 'discard':
      return { type: 'discard', tileKey: tileKey(action.tile) };
    case 'call-naki':
      return { type: 'call-naki', option: optionDescriptor(action.option) };
    case 'pass-tsumo':
      return { type: 'pass-tsumo' };
    case 'pass-naki':
      return { type: 'pass-naki' };
  }
}

function describeWin(action: WinAction): WinDescriptor {
  if (action.type === 'ron') {
    return {
      type: 'ron',
      tileKey: tileKey(action.tile),
      riichi: action.riichi,
      lastMomentRiichi: action.lastMomentRiichi,
      score: action.score,
    };
  }
  return {
    type: 'tsumo',
    riichi: action.riichi,
    lastMomentRiichi: action.lastMomentRiichi,
    score: action.score,
  };
}

function materializeStep(state: State, descriptor: StepDescriptor): StepAction | null {
  switch (descriptor.type) {
    case 'draw':
      return { type: 'draw' };
    case 'cpu-turn':
      return { type: 'cpu-turn' };
    case 'discard': {
      const candidates = state.phase === 'playerNakiDiscard'
        ? uniqueTiles(state.playerHand)
        : uniqueTiles([
            ...state.playerHand,
            ...(state.playerDrawnTile ? [state.playerDrawnTile] : []),
          ]);
      const tile = candidates.find((candidate) => tileKey(candidate) === descriptor.tileKey);
      return tile ? { type: 'discard', tile } : null;
    }
    case 'call-naki': {
      const option = state.nakiOptions.find(
        (candidate) => optionKey(candidate) === optionDescriptorKey(descriptor.option),
      );
      return option ? { type: 'call-naki', option } : null;
    }
    case 'pass-tsumo':
      return { type: 'pass-tsumo' };
    case 'pass-naki':
      return { type: 'pass-naki' };
  }
}

function materializeWin(state: State, descriptor: WinDescriptor): WinAction | null {
  if (descriptor.type === 'tsumo') {
    return {
      type: 'tsumo',
      riichi: descriptor.riichi,
      lastMomentRiichi: descriptor.lastMomentRiichi,
      score: descriptor.score,
    };
  }

  const tile = state.phase === 'cpuTurn'
    ? state.wall[0]
    : state.lastCpuDiscard ?? state.winTile;
  if (!tile || tileKey(tile) !== descriptor.tileKey) return null;
  return {
    type: 'ron',
    tile,
    riichi: descriptor.riichi,
    lastMomentRiichi: descriptor.lastMomentRiichi,
    score: descriptor.score,
  };
}

function applyStep(state: State, action: StepAction): State | null {
  switch (action.type) {
    case 'draw':
      return applyPlayerDraw(state);
    case 'cpu-turn':
      return applyCpuTurn(state);
    case 'discard':
      return state.phase === 'playerNakiDiscard'
        ? applyPlayerNakiDiscard(state, action.tile)
        : applyPlayerDiscard(state, action.tile);
    case 'call-naki':
      return applyCallNaki(state, action.option);
    case 'pass-tsumo':
      return applyPassTsumo(state);
    case 'pass-naki':
      return applyPassNaki(state);
  }
}

function scoreWinningState(
  state: State,
  allowLastMomentRiichi = true,
  scoreCache?: Map<string, number | null>,
): { score: number; riichi: boolean; lastMomentRiichi: boolean } | null {
  const scoreVariants: Array<{ state: State; riichi: boolean; lastMomentRiichi: boolean }> = [
    { state, riichi: state.isRiichi, lastMomentRiichi: false },
  ];

  // The app's puzzle rule only evaluates riichi immediately before the final
  // win. A previous discard must exist, the hand must be closed and tenpai,
  // and a rinshan win cannot gain a retroactive riichi declaration.
  if (
    allowLastMomentRiichi &&
    !state.isRiichi &&
    state.turnCount > 0 &&
    isMenzen(state.playerFuro) &&
    checkTenpai(state.playerHand, state.playerFuro.length)
  ) {
    scoreVariants.push({
      state: { ...state, isRiichi: true, isIppatsu: true },
      riichi: true,
      lastMomentRiichi: true,
    });
  }

  let best: { score: number; riichi: boolean; lastMomentRiichi: boolean } | null = null;
  for (const variant of scoreVariants) {
    try {
      // scoreAdapter.buildHandInput consumes only these fields. Ignore river,
      // physical tile IDs and wall position so equivalent winning hands can
      // share the costly riichi-score analysis across different search paths.
      const scoreKey = JSON.stringify({
        hand: variant.state.playerHand.map(tileKey).sort(),
        furo: variant.state.playerFuro.map((meld) => ({
          type: meld.type,
          tiles: meld.tiles.map(tileKey).sort(),
          called: tileKey(meld.calledTile),
        })),
        winType: variant.state.winType,
        winTile: variant.state.winTile ? tileKey(variant.state.winTile) : null,
        wind: [variant.state.roundWind, variant.state.playerWind],
        indicators: variant.state.wanpai.slice(4, 4 + variant.state.doraCount).map(furitenTileKey),
        ura: variant.state.isRiichi
          ? variant.state.wanpai.slice(9, 9 + variant.state.doraCount).map(furitenTileKey)
          : [],
        riichi: variant.state.isRiichi,
        ippatsu: variant.state.isIppatsu,
      });
      const cached = scoreCache?.get(scoreKey);
      if (scoreCache?.has(scoreKey)) {
        if (cached !== null && cached !== undefined &&
            (!best || cached > best.score)) {
          best = {
            score: cached,
            riichi: variant.riichi,
            lastMomentRiichi: variant.lastMomentRiichi,
          };
        }
        continue;
      }
      const analysis = scoreHand(variant.state);
      if (!analysis?.valid || analysis.handInterpretations.length === 0) {
        scoreCache?.set(scoreKey, null);
        continue;
      }
      const score = Math.max(...analysis.handInterpretations.map((hand) => hand.totalWinnings));
      scoreCache?.set(scoreKey, Number.isFinite(score) ? score : null);
      if (Number.isFinite(score) && (!best || score > best.score)) {
        best = {
          score,
          riichi: variant.riichi,
          lastMomentRiichi: variant.lastMomentRiichi,
        };
      }
    } catch {
      // Invalid interpretations are not winning candidates.
    }
  }
  return best;
}

/**
 * Searches the deterministic-wall game rules for one highest-scoring win.
 * Values and choices are memoized by semantic state, while physical tile IDs
 * are rebound during reconstruction so the returned line can be replayed.
 */
export function searchBestWin(
  initialState: State,
  options: SolverOptions = {},
): SolverResult {
  // First milestone searches closed-hand play without any kan or calls.
  // Chi, pon, daiminkan, ankan and kakan are not explored. Reject an already-open input rather
  // than silently returning an answer for a narrower/different problem.
  if (!isMenzen(initialState.playerFuro)) {
    return {
      supported: false,
      unsupportedReason: 'open-hand',
      outcome: null,
      bestScore: null,
      line: [],
      complete: false,
      stats: { statesVisited: 0, cacheHits: 0, elapsedMs: 0 },
    };
  }

  const maxStates = options.maxStates ?? 200_000;
  const maxDurationMs = options.maxDurationMs ?? 3_000;
  const startedAt = Date.now();
  const memo = new Map<string, SearchNode>();
  const scoreCache = new Map<string, number | null>();
  const tenpaiCache = new Map<string, boolean>();
  const completionCache = new Map<string, boolean>();
  const futureCompletionPossible = (state: State): boolean => {
    // No kan in this milestone: future wall draws alternate CPU/player.
    // CPU discards are only eligible as the ONE winning ron tile.
    // We deliberately ignore chronology and furiten here, so this is an
    // optimistic upper bound; a false result safely rules out any win.
    const key = state.phase + '|' + state.playerHand.map(furitenTileKey).sort().join(',') + '|' +
      (state.playerDrawnTile ? furitenTileKey(state.playerDrawnTile) : '') + '|' +
      state.wallDrawnCount + ':' + state.wall.length + '|' +
      (state.phase === 'naki' && state.lastCpuDiscard ? furitenTileKey(state.lastCpuDiscard) : '');
    const cached = completionCache.get(key);
    if (cached !== undefined) return cached;

    const playerPool = [
      ...state.playerHand,
      ...(state.playerDrawnTile ? [state.playerDrawnTile] : []),
    ];
    const cpuTiles: Tile[] = [];
    if (state.phase === 'naki' && state.lastCpuDiscard) cpuTiles.push(state.lastCpuDiscard);
    const cpuFirst = state.phase === 'playerDiscard' || state.phase === 'cpuTurn' ||
      state.phase === 'playerNakiDiscard';
    for (let i = 0; i < state.wall.length; i++) {
      const cpuDraw = (i % 2 === 0) === cpuFirst;
      if (cpuDraw) cpuTiles.push(state.wall[i]);
      else playerPool.push(state.wall[i]);
    }

    // Tsumo consumes no CPU tile; ron consumes precisely one.
    let possible = couldBuildWinningHand(playerPool);
    if (!possible) {
      const seen = new Set<string>();
      for (const tile of cpuTiles) {
        const face = furitenTileKey(tile);
        if (seen.has(face)) continue;
        seen.add(face);
        if (couldBuildWinningHand([...playerPool, tile])) {
          possible = true;
          break;
        }
      }
    }
    completionCache.set(key, possible);
    return possible;
  };
  const isTenpai = (state: State): boolean => {
    const key = state.playerFuro.length + '|' + state.playerHand.map(furitenTileKey).sort().join(',');
    const cached = tenpaiCache.get(key);
    if (cached !== undefined) return cached;
    const value = checkTenpai(state.playerHand, state.playerFuro.length);
    tenpaiCache.set(key, value);
    return value;
  };
  let statesVisited = 0;
  let cacheHits = 0;
  let complete = true;

  const interrupted = () =>
    statesVisited >= maxStates || Date.now() - startedAt >= maxDurationMs;

  const search = (state: State, lastDrawWasKan = false): SearchNode => {
    if (!complete) return { rank: 0, score: null };

    const key = memoKey(state, lastDrawWasKan);
    const cached = memo.get(key);
    if (cached) {
      cacheHits++;
      return cached;
    }

    if (interrupted()) {
      complete = false;
      return { rank: 0, score: null };
    }
    statesVisited++;

    if (state.phase === 'win') {
      const scored = scoreWinningState(state, !lastDrawWasKan && (state.winType !== 'ron' || state.wall.length > 0), scoreCache);
      const terminal: SearchNode = scored
        ? { rank: 2, score: scored.score }
        : { rank: 0, score: null };
      memo.set(key, terminal);
      return terminal;
    }
    if (state.phase === 'exhausted') {
      const tenpai = isTenpai(state);
      const terminal: SearchNode = { rank: tenpai ? 1 : 0, score: null };
      memo.set(key, terminal);
      return terminal;
    }

    let bestRank: 0 | 1 | 2 = 0;
    let bestScore: number | null = null;
    let bestChoice: SearchChoice | undefined;

    const consider = (action: StepAction, nextState: State | null, nextDrawWasKan = false) => {
      if (!complete || !nextState) return;
      // Once a winning line exists, a branch proven unable to make ANY
      // complete hand cannot improve it. Do not prune tenpai fallback.
      if (bestRank === 2 && nextState.wall.length <= 12 &&
          !futureCompletionPossible(nextState)) return;
      const child = search(nextState, nextDrawWasKan);
      const isBetter = !bestChoice || child.rank > bestRank ||
        (child.rank === 2 && bestRank === 2 && child.score !== null &&
          (bestScore === null || child.score > bestScore));
      if (isBetter) {
        bestRank = child.rank;
        bestScore = child.score;
        bestChoice = { kind: 'step', action: describeStep(action) };
      }
    };

    const considerWin = (winState: State | null, type: 'tsumo' | 'ron') => {
      if (!complete || !winState) return;
      const scored = scoreWinningState(winState, !lastDrawWasKan && (type !== 'ron' || state.wall.length > 0), scoreCache);
      if (scored && (bestRank < 2 || (bestRank === 2 && (bestScore === null || scored.score > bestScore)))) {
        bestRank = 2;
        bestScore = scored.score;
        const action: WinAction = type === 'ron'
          ? {
              type: 'ron',
              tile: winState.winTile!,
              riichi: scored.riichi,
              lastMomentRiichi: scored.lastMomentRiichi,
              score: scored.score,
            }
          : {
              type: 'tsumo',
              riichi: scored.riichi,
              lastMomentRiichi: scored.lastMomentRiichi,
              score: scored.score,
            };
        bestChoice = { kind: 'win', action: describeWin(action) };
      }
    };

    switch (state.phase) {
      case 'playerDraw': {
        consider({ type: 'draw' }, applyPlayerDraw(state));
        break;
      }

      case 'cpuTurn': {
        // Normal gameplay only exposes ron when the current hand already has
        // yaku. Also test the puzzle's last-moment-riichi ron before this
        // deterministic CPU discard, even when normal gameplay hides no-yaku ron.
        const cpuDiscard = state.wall[0];
        if (
          cpuDiscard &&
          !state.isRiichi &&
          state.turnCount > 0 &&
          isMenzen(state.playerFuro) &&
          checkTenpai(state.playerHand, state.playerFuro.length) &&
          canRonConcealed(state.playerHand, cpuDiscard, state.playerFuro.length) &&
          !isFuriten(getWaits(state.playerHand, state.playerFuro), state.playerDiscards)
        ) {
          const hypotheticalWin: State = {
            ...state,
            phase: 'win',
            winType: 'ron',
            winTile: cpuDiscard,
            playerDrawnTile: null,
            lastCpuDiscard: cpuDiscard,
          };
          // This is BEFORE the CPU discards: one tile is consumed by ron,
          // so there must be another wall tile for our next draw.
          const scored = scoreWinningState(hypotheticalWin, state.wall.length >= 2, scoreCache);
          if (scored) {
            bestRank = 2;
            bestScore = scored.score;
            bestChoice = {
              kind: 'cpu-turn-ron',
              win: {
                type: 'ron',
                tileKey: tileKey(cpuDiscard),
                riichi: scored.riichi,
                lastMomentRiichi: scored.lastMomentRiichi,
                score: scored.score,
              },
            };
          }
        }

        consider({ type: 'cpu-turn' }, applyCpuTurn(state));
        break;
      }

      case 'playerDiscard': {
        if (state.tsumoAvailable) {
          considerWin(applyDeclareTsumo(state), 'tsumo');
          // A player must pass the available tsumo before taking another
          // action. Search discard choices from that explicit state.
          consider({ type: 'pass-tsumo' }, applyPassTsumo(state));
          break;
        }

        const discardChoices = uniqueTiles([
          ...state.playerHand,
          ...(state.playerDrawnTile ? [state.playerDrawnTile] : []),
        ]);
        for (const tile of discardChoices) {
          consider({ type: 'discard', tile }, applyPlayerDiscard(state, tile));
          if (!complete) break;
        }

        break;
      }

      case 'playerNakiDiscard': {
        for (const tile of uniqueTiles(state.playerHand)) {
          consider({ type: 'discard', tile }, applyPlayerNakiDiscard(state, tile));
          if (!complete) break;
        }
        break;
      }

      case 'naki': {
        if (state.ronAvailable) {
          considerWin(applyCallRon(state), 'ron');
          consider({ type: 'pass-naki' }, applyPassNaki(state));
        } else {
          consider({ type: 'pass-naki' }, applyPassNaki(state));
        }

        // In a closed-hand solver, the player may ron or decline the
        // discard, but may not chi, pon or daiminkan.
        break;
      }

      // Early riichi decisions are intentionally not explored.
      case 'riichiSelect':
        break;
    }

    const result: SearchNode = { rank: bestRank, score: bestScore, choice: bestChoice };
    if (complete) memo.set(key, result);
    return result;
  };

  const root = search(initialState);
  const line: SolverAction[] = [];

  if (complete) {
    let current = initialState;
    let lastDrawWasKan = false;

    // Every reconstructed step consumes a draw, discard, or pass;
    // the guard is defensive against a malformed transition graph.
    for (let step = 0; step < 100; step++) {
      const record = memo.get(memoKey(current, lastDrawWasKan));
      if (!record?.choice) break;

      const choice = record.choice;
      if (choice.kind === 'win') {
        const action = materializeWin(current, choice.action);
        if (action) line.push(action);
        break;
      }

      if (choice.kind === 'cpu-turn-ron') {
        line.push({ type: 'cpu-turn' });
        const tile = current.wall[0];
        if (tile) {
          line.push({
            type: 'ron',
            tile,
            riichi: choice.win.riichi,
            lastMomentRiichi: choice.win.lastMomentRiichi,
            score: choice.win.score,
          });
        }
        break;
      }

      const action = materializeStep(current, choice.action);
      if (!action) break;
      line.push(action);
      const nextState = applyStep(current, action);
      if (!nextState) break;

      lastDrawWasKan = false;
      current = nextState;
    }

    // Riichi is declared on the discard before the final ron / tsumo. Mark it
    // in the returned line when that discard is part of the searched path.
    const winningAction = line[line.length - 1];
    if (
      winningAction &&
      (winningAction.type === 'tsumo' || winningAction.type === 'ron') &&
      winningAction.lastMomentRiichi
    ) {
      for (let i = line.length - 2; i >= 0; i--) {
        const action = line[i];
        if (action.type === 'discard') {
          line[i] = { ...action, riichi: true };
          break;
        }
      }
    }
  }

  const elapsedMs = Date.now() - startedAt;
  return {
    supported: true,
    outcome: complete ? (root.rank === 2 ? 'win' : root.rank === 1 ? 'tenpai' : 'noten') : null,
    bestScore: complete && root.rank === 2 ? root.score : null,
    line: complete ? line : [],
    complete,
    stats: { statesVisited, cacheHits, elapsedMs },
  };
}

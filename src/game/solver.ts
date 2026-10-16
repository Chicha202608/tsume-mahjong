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
  | { type: 'ankan'; option: NakiOption }
  | { type: 'pass-tsumo' }
  | { type: 'pass-naki' }
  | { type: 'tsumo'; riichi: boolean; lastMomentRiichi: boolean; score: number }
  | { type: 'ron'; tile: Tile; riichi: boolean; lastMomentRiichi: boolean; score: number };

export interface SolverResult {
  /** False when the input state is outside this closed-hand solver's scope. */
  supported: boolean;
  unsupportedReason?: 'open-hand';
  /** Outcome of the selected line. Null means unsupported or incomplete. */
  outcome: 'win' | 'tenpai' | 'noten' | null;
  /** Score for the player, including the tenpai-draw payment. Null means no result was found. */
  bestScore: number | null;
  /** One maximum-score line. Other equally scoring lines are not enumerated yet. */
  line: SolverAction[];
  complete: boolean;
  stats: {
    statesVisited: number;
    cacheHits: number;
    prunedBranches: number;
    elapsedMs: number;
    ankanCombinations?: number;
    replayedLines?: number;
    timeLimitReached?: boolean;
  };
}

export interface SolverOptions {
  /** Safety limit for the first prototype. An incomplete search never claims an answer. */
  maxStates?: number;
  /** Safety time limit for the first prototype. An incomplete search never claims an answer. */
  maxDurationMs?: number;
  /** Experimental heuristic: skip discards from any currently completed meld. Not exact. */
  preserveCompletedMelds?: boolean;
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
  /** Number of wall draws consumed when this winning line ends. */
  winWallDrawCount: number | null;
  /** Semantic action descriptor; contains no physical tile IDs. */
  choice?: SearchChoice;
}

/** Prefer a higher score, then the earlier win, leaving an exact tie stable. */
export function preferSolverCandidate(
  candidate: { rank: 0 | 1 | 2; score: number | null; winWallDrawCount: number | null },
  incumbent: { rank: 0 | 1 | 2; score: number | null; winWallDrawCount: number | null },
): boolean {
  if (candidate.rank !== incumbent.rank) return candidate.rank > incumbent.rank;
  if (candidate.rank !== 2) return false;
  if (candidate.score !== incumbent.score) return (candidate.score ?? -1) > (incumbent.score ?? -1);
  return (candidate.winWallDrawCount ?? Infinity) < (incumbent.winWallDrawCount ?? Infinity);
}

function tileKey(tile: Tile): string {
  return `${tile.suit}-${tile.value}-${tile.isRed ? 1 : 0}`;
}

function furitenTileKey(tile: Tile): string {
  return `${tile.suit}-${tile.value}`;
}

/** Faces belonging to at least one completed triplet or sequence. */
function completedMeldFaces(tiles: Tile[]): Set<string> {
  const counts = new Map<string, number>();
  for (const tile of tiles) {
    const key = furitenTileKey(tile);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const protectedFaces = new Set<string>();
  for (const tile of tiles) {
    const face = furitenTileKey(tile);
    if ((counts.get(face) ?? 0) >= 3) protectedFaces.add(face);
    if (tile.suit !== 'man' && tile.suit !== 'pin' && tile.suit !== 'sou') continue;
    for (let start = Math.max(1, tile.value - 2); start <= Math.min(7, tile.value); start++) {
      const faces = [start, start + 1, start + 2].map(v => tile.suit + '-' + v);
      if (faces.every(k => (counts.get(k) ?? 0) > 0)) {
        for (const k of faces) protectedFaces.add(k);
      }
    }
  }
  return protectedFaces;
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
 * Optimistic tenpai feasibility: the final 13 tiles must be selectable from
 * the player's tiles, with ONE arbitrary hypothetical winning tile completing
 * a legal hand. This covers normal hands, chiitoitsu and kokushi.
 * The arbitrary tile is not drawn from the wall: tenpai need not be agari.
 */
export function couldBuildTenpai(pool: Tile[]): boolean {
  if (pool.length < 13) return false;
  const counts = Array<number>(34).fill(0);
  for (const tile of pool) {
    const group = tile.suit === 'man' ? 0 : tile.suit === 'pin' ? 9
      : tile.suit === 'sou' ? 18 : tile.suit === 'wind' ? 27 : 31;
    counts[group + tile.value - 1]++;
  }

  // Normal tenpai: three complete melds, one pair, one incomplete meld;
  // alternatively four complete melds and a singleton pair wait.
  // Since the pool may contain extra future draws, consume only the tiles
  // necessary for each pattern, leaving all unrelated tiles unused.
  const memo = new Map<string, boolean>();
  const search = (melds: number, pairsNeeded: number, waits: number): boolean => {
    if (melds === 0 && pairsNeeded === 0 && waits === 0) return true;
    const key = melds + ':' + pairsNeeded + ':' + waits + ':' + counts.join(',');
    const hit = memo.get(key);
    if (hit !== undefined) return hit;

    for (let i = 0; i < 34; i++) {
      if (pairsNeeded && counts[i] >= 2) {
        counts[i] -= 2;
        const ok = search(melds, 0, waits);
        counts[i] += 2;
        if (ok) { memo.set(key, true); return true; }
      }
      if (waits && counts[i] >= 1) {
        // Tanki is a one-tile incomplete pair.
        if (!pairsNeeded && counts[i] >= 1 && melds === 4) {
          counts[i]--;
          const ok = search(melds, 0, 0);
          counts[i]++;
          if (ok) { memo.set(key, true); return true; }
        }
        // Ryanmen, kanchan and penchan: any two ranks that can
        // participate in a run of three; also a shanpon pair.
        if (counts[i] >= 2) {
          counts[i] -= 2;
          const ok = search(melds, pairsNeeded, 0);
          counts[i] += 2;
          if (ok) { memo.set(key, true); return true; }
        }
        if (i < 27) {
          for (let delta = 1; delta <= 2; delta++) {
            const j = i + delta;
            if (j >= 27 || Math.floor(j / 9) !== Math.floor(i / 9) || !counts[j]) continue;
            // The missing tile must make a legal 3-long sequence.
            if (delta === 2 || i % 9 <= 7) {
              counts[i]--; counts[j]--;
              const ok = search(melds, pairsNeeded, 0);
              counts[i]++; counts[j]++;
              if (ok) { memo.set(key, true); return true; }
            }
          }
        }
      }
      if (melds > 0) {
        if (counts[i] >= 3) {
          counts[i] -= 3;
          const ok = search(melds - 1, pairsNeeded, waits);
          counts[i] += 3;
          if (ok) { memo.set(key, true); return true; }
        }
        if (i < 27 && i % 9 <= 6 && counts[i] && counts[i+1] && counts[i+2]) {
          counts[i]--; counts[i+1]--; counts[i+2]--;
          const ok = search(melds - 1, pairsNeeded, waits);
          counts[i]++; counts[i+1]++; counts[i+2]++;
          if (ok) { memo.set(key, true); return true; }
        }
      }
    }
    memo.set(key, false);
    return false;
  };
  return search(3, 1, 1) || search(4, 0, 1);
}

/** True only for a standard four-meld-and-pair winning hand. */
function isStandardWin(tiles: Tile[]): boolean {
  if (tiles.length !== 14) return false;
  const counts = Array<number>(34).fill(0);
  for (const tile of tiles) {
    const base = tile.suit === 'man' ? 0 : tile.suit === 'pin' ? 9 :
      tile.suit === 'sou' ? 18 : tile.suit === 'wind' ? 27 : 31;
    counts[base + tile.value - 1]++;
  }
  const melds = (needed: number): boolean => {
    if (!needed) return counts.every(n => n === 0);
    const i = counts.findIndex(n => n > 0);
    if (i < 0) return false;
    if (counts[i] >= 3) {
      counts[i] -= 3;
      const ok = melds(needed - 1);
      counts[i] += 3;
      if (ok) return true;
    }
    if (i < 27 && i % 9 <= 6 && counts[i+1] && counts[i+2]) {
      counts[i]--; counts[i+1]--; counts[i+2]--;
      const ok = melds(needed - 1);
      counts[i]++; counts[i+1]++; counts[i+2]++;
      if (ok) return true;
    }
    return false;
  };
  for (let i = 0; i < 34; i++) {
    if (counts[i] < 2) continue;
    counts[i] -= 2;
    const ok = melds(4);
    counts[i] += 2;
    if (ok) return true;
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
  // Special hands are deferred for this milestone, including hands that are
  // both chiitoitsu and a standard hand (the standard interpretation remains).
  if (!state.winTile || !isStandardWin([...state.playerHand,
    ...(state.winType === 'tsumo' && state.playerDrawnTile
      ? [state.playerDrawnTile] : state.winType === 'ron' ? [state.winTile] : [])])) return null;
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
      stats: { statesVisited: 0, cacheHits: 0, prunedBranches: 0, elapsedMs: 0 },
    };
  }

  const maxStates = options.maxStates ?? 200_000;
  const preserveCompletedMelds = options.preserveCompletedMelds ?? false;
  const maxDurationMs = options.maxDurationMs ?? 3_000;
  const startedAt = Date.now();
  const memo = new Map<string, SearchNode>();
  const scoreCache = new Map<string, number | null>();
  const tenpaiCache = new Map<string, boolean>();
  const completionCache = new Map<string, boolean>();
  const futureTenpaiPossible = (state: State): boolean => {
    // No kan in this milestone. CPU draws cannot be used to build tenpai,
    // though they can still be the final ron tile AFTER tenpai is achieved.
    // Deliberately ignore draw chronology, allowing extra false positives.
    const key = state.phase + '|' + state.playerHand.map(furitenTileKey).sort().join(',') + '|' +
      (state.playerDrawnTile ? furitenTileKey(state.playerDrawnTile) : '') + '|' +
      state.wallDrawnCount + ':' + state.wall.length;
    const cached = completionCache.get(key);
    if (cached !== undefined) return cached;
    const playerPool = [
      ...state.playerHand,
      ...(state.playerDrawnTile ? [state.playerDrawnTile] : []),
    ];
    const cpuFirst = state.phase === 'playerDiscard' || state.phase === 'cpuTurn' ||
      state.phase === 'playerNakiDiscard';
    for (let i = 0; i < state.wall.length; i++) {
      if ((i % 2 === 0) !== cpuFirst) playerPool.push(state.wall[i]);
    }
    const possible = couldBuildTenpai(playerPool);
    completionCache.set(key, possible);
    return possible;
  };
  const isTenpai = (state: State): boolean => {
    const key = state.playerFuro.length + '|' + state.playerHand.map(furitenTileKey).sort().join(',');
    const cached = tenpaiCache.get(key);
    if (cached !== undefined) return cached;
    const value = couldBuildTenpai(state.playerHand);
    tenpaiCache.set(key, value);
    return value;
  };
  let statesVisited = 0;
  let cacheHits = 0;
  let prunedBranches = 0;
  let complete = true;

  const interrupted = () =>
    statesVisited >= maxStates || Date.now() - startedAt >= maxDurationMs;

  const search = (state: State, lastDrawWasKan = false): SearchNode => {
    if (!complete) return { rank: 0, score: null, winWallDrawCount: null };

    const key = memoKey(state, lastDrawWasKan);
    const cached = memo.get(key);
    if (cached) {
      cacheHits++;
      return cached;
    }

    if (interrupted()) {
      complete = false;
      return { rank: 0, score: null, winWallDrawCount: null };
    }
    statesVisited++;

    if (state.phase === 'win') {
      const scored = scoreWinningState(state, !lastDrawWasKan && (state.winType !== 'ron' || state.wall.length > 0), scoreCache);
      const terminal: SearchNode = scored
        ? { rank: 2, score: scored.score, winWallDrawCount: state.wallDrawnCount }
        : { rank: 0, score: null, winWallDrawCount: null };
      memo.set(key, terminal);
      return terminal;
    }
    if (state.phase === 'exhausted') {
      const tenpai = isTenpai(state);
      const terminal: SearchNode = { rank: tenpai ? 1 : 0, score: null, winWallDrawCount: null };
      memo.set(key, terminal);
      return terminal;
    }

    let bestRank: 0 | 1 | 2 = 0;
    let bestScore: number | null = null;
    let bestWinWallDrawCount: number | null = null;
    let bestChoice: SearchChoice | undefined;

    const consider = (action: StepAction, nextState: State | null, nextDrawWasKan = false) => {
      if (!complete || !nextState) return;
      // A branch that cannot even reach tenpai cannot improve an existing
      // tenpai-or-better result. A noten fallback remains unpruned.
      if (bestRank >= 1 && nextState.wall.length <= 12 &&
          !futureTenpaiPossible(nextState)) {
        prunedBranches++;
        return;
      }
      const child = search(nextState, nextDrawWasKan);
      const isBetter = !bestChoice || preferSolverCandidate(child, {
        rank: bestRank, score: bestScore, winWallDrawCount: bestWinWallDrawCount,
      });
      if (isBetter) {
        bestRank = child.rank;
        bestScore = child.score;
        bestWinWallDrawCount = child.winWallDrawCount;
        bestChoice = { kind: 'step', action: describeStep(action) };
      }
    };

    const considerWin = (winState: State | null, type: 'tsumo' | 'ron') => {
      if (!complete || !winState) return;
      const scored = scoreWinningState(winState, !lastDrawWasKan && (type !== 'ron' || state.wall.length > 0), scoreCache);
      if (scored && (bestRank < 2 || preferSolverCandidate({
        rank: 2, score: scored.score, winWallDrawCount: winState!.wallDrawnCount,
      }, { rank: bestRank, score: bestScore, winWallDrawCount: bestWinWallDrawCount }))) {
        bestRank = 2;
        bestScore = scored.score;
        bestWinWallDrawCount = winState!.wallDrawnCount;
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
            bestWinWallDrawCount = state.wallDrawnCount + 1;
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

        const allDiscardChoices = uniqueTiles([
          ...state.playerHand,
          ...(state.playerDrawnTile ? [state.playerDrawnTile] : []),
        ]);
        const protectedFaces = preserveCompletedMelds
          ? completedMeldFaces([...state.playerHand, ...(state.playerDrawnTile ? [state.playerDrawnTile] : [])])
          : new Set<string>();
        const filteredDiscards = allDiscardChoices.filter(tile => !protectedFaces.has(furitenTileKey(tile)));
        // If every tile belongs to a meld, retain all choices instead of dead-ending.
        const discardChoices = filteredDiscards.length ? filteredDiscards : allDiscardChoices;
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

    const result: SearchNode = { rank: bestRank, score: bestScore, winWallDrawCount: bestWinWallDrawCount, choice: bestChoice };
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
    stats: { statesVisited, cacheHits, prunedBranches, elapsedMs },
  };
}

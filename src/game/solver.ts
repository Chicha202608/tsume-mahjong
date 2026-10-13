import { Tile } from '@/types';
import {
  findAnkanOptions,
  findKakanOptions,
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
  applyDeclareKan,
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
  | { type: 'kan'; option: NakiOption }
  | { type: 'pass-tsumo' }
  | { type: 'pass-naki' }
  | { type: 'tsumo'; riichi: boolean; lastMomentRiichi: boolean; score: number }
  | { type: 'ron'; tile: Tile; riichi: boolean; lastMomentRiichi: boolean; score: number };

export interface SolverResult {
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
  { type: 'draw' | 'cpu-turn' | 'discard' | 'call-naki' | 'kan' | 'pass-tsumo' | 'pass-naki' }
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
  | { type: 'kan'; option: OptionDescriptor }
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
    case 'kan':
      return { type: 'kan', option: optionDescriptor(action.option) };
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
    case 'kan': {
      const options = state.phase === 'naki'
        ? state.nakiOptions
        : [
            ...findAnkanOptions(state.playerHand, state.playerDrawnTile),
            ...findKakanOptions(state.playerHand, state.playerDrawnTile, state.playerFuro),
          ];
      const option = options.find(
        (candidate) => optionKey(candidate) === optionDescriptorKey(descriptor.option),
      );
      return option ? { type: 'kan', option } : null;
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
    case 'kan':
      return applyDeclareKan(state, action.option);
    case 'pass-tsumo':
      return applyPassTsumo(state);
    case 'pass-naki':
      return applyPassNaki(state);
  }
}

function scoreWinningState(
  state: State,
  allowLastMomentRiichi = true,
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
      const analysis = scoreHand(variant.state);
      if (!analysis?.valid || analysis.handInterpretations.length === 0) continue;
      const score = Math.max(...analysis.handInterpretations.map((hand) => hand.totalWinnings));
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
  const maxStates = options.maxStates ?? 200_000;
  const maxDurationMs = options.maxDurationMs ?? 3_000;
  const startedAt = Date.now();
  const memo = new Map<string, SearchNode>();
  let statesVisited = 0;
  let cacheHits = 0;
  let complete = true;

  const interrupted = () =>
    statesVisited >= maxStates || Date.now() - startedAt >= maxDurationMs;

  const search = (state: State, lastDrawWasKan = false): SearchNode => {
    if (!complete) return { score: null };

    const key = memoKey(state, lastDrawWasKan);
    const cached = memo.get(key);
    if (cached) {
      cacheHits++;
      return cached;
    }

    if (interrupted()) {
      complete = false;
      return { score: null };
    }
    statesVisited++;

    if (state.phase === 'win') {
      const scored = scoreWinningState(state, !lastDrawWasKan);
      const terminal: SearchNode = { score: scored?.score ?? null };
      memo.set(key, terminal);
      return terminal;
    }
    if (state.phase === 'exhausted') {
      const terminal: SearchNode = { score: null };
      memo.set(key, terminal);
      return terminal;
    }

    let bestScore: number | null = null;
    let bestChoice: SearchChoice | undefined;

    const consider = (action: StepAction, nextState: State | null, nextDrawWasKan = false) => {
      if (!complete || !nextState) return;
      const child = search(nextState, nextDrawWasKan);
      if (child.score !== null && (bestScore === null || child.score > bestScore)) {
        bestScore = child.score;
        bestChoice = { kind: 'step', action: describeStep(action) };
      }
    };

    const considerWin = (winState: State | null, type: 'tsumo' | 'ron') => {
      if (!complete || !winState) return;
      const scored = scoreWinningState(winState, !lastDrawWasKan);
      if (scored && (bestScore === null || scored.score > bestScore)) {
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
          const scored = scoreWinningState(hypotheticalWin);
          if (scored && (bestScore === null || scored.score > bestScore)) {
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
          // action. Search the discard/kan choices from that explicit state.
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

        if (complete && state.playerDrawnTile) {
          const kanOptions = [
            ...findAnkanOptions(state.playerHand, state.playerDrawnTile),
            ...findKakanOptions(state.playerHand, state.playerDrawnTile, state.playerFuro),
          ];
          for (const option of kanOptions) {
            consider({ type: 'kan', option }, applyDeclareKan(state, option), true);
            if (!complete) break;
          }
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

        if (complete) {
          for (const option of state.nakiOptions) {
            if (option.type === 'daiminkan') {
              consider({ type: 'kan', option }, applyDeclareKan(state, option), true);
            } else {
              consider({ type: 'call-naki', option }, applyCallNaki(state, option));
            }
            if (!complete) break;
          }
        }
        break;
      }

      // Early riichi decisions are intentionally not explored.
      case 'riichiSelect':
        break;
    }

    const result: SearchNode = { score: bestScore, choice: bestChoice };
    if (complete) memo.set(key, result);
    return result;
  };

  const root = search(initialState);
  const line: SolverAction[] = [];

  if (complete) {
    let current = initialState;
    let lastDrawWasKan = false;

    // Every reconstructed step consumes a draw, discard, call, pass, or kan;
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

      lastDrawWasKan = action.type === 'kan';
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
    bestScore: complete ? root.score : null,
    line: complete ? line : [],
    complete,
    stats: { statesVisited, cacheHits, elapsedMs },
  };
}

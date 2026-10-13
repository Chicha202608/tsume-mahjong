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

interface SearchNode {
  score: number | null;
  action?: SolverAction;
  next?: SearchNode;
  terminal?: boolean;
}

function tileSemanticKey(tile: Tile): string {
  return `${tile.suit}-${tile.value}-${tile.isRed ? 1 : 0}`;
}

function uniqueTiles(tiles: Tile[]): Tile[] {
  const seen = new Set<string>();
  return tiles.filter((tile) => {
    const key = tileSemanticKey(tile);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Exact-state memoization for the initial solver prototype.
 *
 * Physical tile IDs are retained in the key to avoid merging states that the
 * current transition code might distinguish. Discard order is normalized
 * because the current rules only use the player's river as a set for furiten.
 * This favors correctness over maximum cache reuse; semantic-state compression
 * can be added after correctness and performance are measured.
 */
function stateKey(state: State): string {
  // These fields do not affect any future legal action or score in this app:
  // the CPU's held hand/furo are unused because it always discards the next
  // wall tile; fullWall is immutable history; cpuDiscards are display-only;
  // wallDrawnCount is informational. Excluding them keeps each DP key small.
  const {
    cpuHand: _cpuHand,
    cpuFuro: _cpuFuro,
    fullWall: _fullWall,
    cpuDiscards: _cpuDiscards,
    wallDrawnCount: _wallDrawnCount,
    ...relevant
  } = state;
  return JSON.stringify({
    ...relevant,
    playerHand: [...state.playerHand].sort((a, b) => a.id.localeCompare(b.id)),
    playerDiscards: [...state.playerDiscards].sort((a, b) => a.id.localeCompare(b.id)),
  });
}

function scoreWinningState(
  state: State,
  allowLastMomentRiichi = true,
): { score: number; riichi: boolean; lastMomentRiichi: boolean } | null {
  const scoreVariants: Array<{ state: State; riichi: boolean; lastMomentRiichi: boolean }> = [
    { state, riichi: state.isRiichi, lastMomentRiichi: false },
  ];

  // Per this app's agreed puzzle rule, evaluate an immediate riichi + ippatsu
  // option only at the winning point; do not branch into earlier riichi timing.
  // Riichi is only available for a closed hand that was already tenpai before
  // the winning tile was added.
  if (
    allowLastMomentRiichi &&
    !state.isRiichi &&
    // turnCount is incremented by the player's discard. At the initial
    // deal there has been no discard opportunity, so riichi cannot be added
    // retroactively to a win on the very first draw.
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
 * Searches the existing deterministic-wall game rules for one highest-scoring
 * winning line. This is an independent engine: it does not mutate React state
 * or add any UI.
 *
 * The search uses memoization over game states. The first version deliberately
 * uses the existing transition functions so search behavior stays aligned with
 * gameplay. If a safety limit is reached, complete=false and bestScore=null:
 * a partial search is never reported as a proven optimum.
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

    const key = `${stateKey(state)}|lastDrawWasKan:${lastDrawWasKan ? 1 : 0}`;
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
      const terminal: SearchNode = scored
        ? { score: scored.score, terminal: true }
        : { score: null, terminal: true };
      memo.set(key, terminal);
      return terminal;
    }
    if (state.phase === 'exhausted') {
      const terminal: SearchNode = { score: null, terminal: true };
      memo.set(key, terminal);
      return terminal;
    }

    let bestScore: number | null = null;
    let bestAction: SolverAction | undefined;
    let bestNext: SearchNode | undefined;
    let bestTerminal = false;

    const consider = (action: SolverAction, nextState: State | null, nextDrawWasKan = false) => {
      if (!complete || !nextState) return;
      const child = search(nextState, nextDrawWasKan);
      if (child.score !== null && (bestScore === null || child.score > bestScore)) {
        bestScore = child.score;
        bestAction = action;
        bestNext = child;
        bestTerminal = false;
      }
    };

    const considerWin = (winState: State | null, type: 'tsumo' | 'ron') => {
      if (!complete || !winState) return;
      const scored = scoreWinningState(winState, !lastDrawWasKan);
      if (scored && (bestScore === null || scored.score > bestScore)) {
        bestScore = scored.score;
        bestAction = type === 'ron'
          ? { type, tile: winState.winTile!, riichi: scored.riichi, lastMomentRiichi: scored.lastMomentRiichi, score: scored.score }
          : { type, riichi: scored.riichi, lastMomentRiichi: scored.lastMomentRiichi, score: scored.score };
        bestNext = undefined;
        bestTerminal = true;
      }
    };

    switch (state.phase) {
      case 'playerDraw': {
        consider({ type: 'draw' }, applyPlayerDraw(state));
        break;
      }

      case 'cpuTurn': {
        // The regular game transition only exposes a ron decision when the
        // hand already has yaku. For the solver's "riichi immediately before
        // the final ron" rule, also test a legal tenpai ron that would gain
        // riichi/ippatsu, even when normal gameplay would not set ronAvailable.
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
            bestAction = { type: 'cpu-turn' };
            bestNext = {
              score: scored.score,
              action: {
                type: 'ron',
                tile: cpuDiscard,
                riichi: scored.riichi,
                lastMomentRiichi: scored.lastMomentRiichi,
                score: scored.score,
              },
              terminal: true,
            };
            bestTerminal = false;
          }
        }

        consider({ type: 'cpu-turn' }, applyCpuTurn(state));
        break;
      }

      case 'playerDiscard': {
        if (state.tsumoAvailable) {
          considerWin(applyDeclareTsumo(state), 'tsumo');
          consider({ type: 'pass-tsumo' }, applyPassTsumo(state));
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

      // The solver does not create early riichi decisions. A starting state
      // already in riichi selection is outside this prototype's supported input.
      case 'riichiSelect':
        break;
    }

    const result: SearchNode = bestScore === null
      ? { score: null }
      : {
          score: bestScore,
          action: bestAction,
          next: bestNext,
          terminal: bestTerminal,
        };
    if (complete) memo.set(key, result);
    return result;
  };

  const root = search(initialState);
  const line: SolverAction[] = [];
  let node: SearchNode | undefined = root;
  while (node?.action) {
    line.push(node.action);
    if (node.terminal) break;
    node = node.next;
  }

  // A last-moment riichi is declared on the discard immediately before the
  // opponent's discard / the next winning draw. Mark that discard in the
  // returned line when it is included in this search path. The winning action's
  // riichi flag still records which scoring variant was selected.
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

  const elapsedMs = Date.now() - startedAt;
  return {
    bestScore: complete ? root.score : null,
    line: complete ? line : [],
    complete,
    stats: { statesVisited, cacheHits, elapsedMs },
  };
}

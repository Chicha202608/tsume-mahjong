import { drawSettlement, TENPAI_DRAW_POINTS } from '@/game/drawSettlement';
import type { Tile } from '@/types';
import type { State } from '@/game/gameState';
import type { SolverAction, SolverResult } from '@/game/solver';
import { findLegalAnkanOptions, getWaits, canRiichi } from '@/gameLogic';
import { enumerateTenpaiCandidates, type TenpaiCandidate } from '@/game/tenpaiCandidates';
import { buildHandInput } from '@/game/scoreAdapter';
import { analyzeSearchHand, type SearchContext } from '@/game/searchContext';
import { isPlayerWallIndex, playerDrawOffset } from '@/game/seatFlow';
import {
  applyPlayerDraw, applyCpuTurn, applyPlayerDiscard, applyDeclareKan,
  applyPassNaki, applyPassTsumo, applyDeclareTsumo, applyCallRon,
} from '@/game/transitions';

function face(t: Tile): number {
  return (t.suit === 'man' ? 0 : t.suit === 'pin' ? 9 : t.suit === 'sou' ? 18 : t.suit === 'wind' ? 27 : 31) + t.value - 1;
}
function counts(tiles: Tile[]): number[] {
  const result = Array<number>(34).fill(0);
  for (const t of tiles) result[face(t)]++;
  return result;
}

/** Compatibility entry point for the one-kan search and its regression tests. */
export function searchWithOneAnkan(
  initial: State, baseline: SolverResult | null, maxDurationMs = 8000,
): SolverResult | null {
  return searchWithAnkan(initial, baseline, maxDurationMs, 1);
}

/** Search one then two kans, sharing a single deadline and scoring cache. */
export function searchWithAnkan(
  initial: State, baseline: SolverResult | null, maxDurationMs = 8000, maxKans: 1 | 2 = 2,
  onProgress?: (result: SolverResult | null) => void,
  context?: SearchContext,
): SolverResult | null {
  if (initial.playerFuro.length || initial.playerDrawnTile || initial.playerHand.length !== 13 ||
      !['playerDraw', 'cpuTurn'].includes(initial.phase) || initial.wanpai.length < 14) return baseline;
  const started = Date.now();
  const deadline = Math.min(started + maxDurationMs, context?.deadline ?? Infinity);
  let best = baseline;
  let bestDraws = Infinity;
  let visited = 0;
  let cacheHits = 0;
  let combinations = 0;
  let replayedLines = 0;
  let timeLimitReached = false;
  let stageDeadline = deadline;
  const scoreCache = new Map<string, number | null>();
  const score = (state: State): number | null => {
    // The scoring input includes the winning tile, kan, dora, wait and flags,
    // but no physical tile IDs or irrelevant history.
    const key = JSON.stringify(buildHandInput(state));
    if (scoreCache.has(key)) { cacheHits++; return scoreCache.get(key)!; }
    let value: number | null = null;
    try {
      const result = analyzeSearchHand(state, context);
      if (result?.valid && result.handInterpretations.length)
        value = Math.max(...result.handInterpretations.map(h => h.totalWinnings));
    } catch { /* An invalid interpretation is not a winning line. */ }
    scoreCache.set(key, value);
    return value;
  };
  const consider = (state: State, line: SolverAction[], type: 'ron' | 'tsumo') => {
    const value = score(state);
    if (value === null || (best?.bestScore !== null && best?.bestScore !== undefined &&
        (value < best.bestScore || (value === best.bestScore && state.wallDrawnCount >= bestDraws)))) return;
    // Retain the no-kan line on a tie; extra kan steps have no benefit then.
    if (value === baseline?.bestScore) return;
    bestDraws = state.wallDrawnCount;
    const action: SolverAction = type === 'tsumo'
      ? { type, riichi: state.isRiichi, lastMomentRiichi: false, score: value }
      : { type, tile: state.winTile!, riichi: state.isRiichi, lastMomentRiichi: false, score: value };
    best = { supported: true, complete: false, outcome: 'win', bestScore: value,
      line: [...line, action], stats: { statesVisited: visited, cacheHits, prunedBranches: 0, elapsedMs: Date.now() - started } };
  };

  const run = (kanFaces: number[], target: TenpaiCandidate, riichiBefore: number) => {
    replayedLines++;
    let state = initial;
    const line: SolverAction[] = [];
    const completed = new Set<number>();
    for (let step = 0; step < 320 && Date.now() < stageDeadline; step++) {
      visited++;
      if (state.phase === 'exhausted') {
        if (completed.size === kanFaces.length && (best?.bestScore ?? -1) < TENPAI_DRAW_POINTS && drawSettlement(state)?.tenpai) {
          best = { supported: true, complete: false, outcome: 'tenpai', bestScore: TENPAI_DRAW_POINTS,
            line: [...line], stats: { statesVisited: visited, cacheHits, prunedBranches: 0, elapsedMs: Date.now() - started } };
        }
        break;
      }
      if (state.phase === 'playerDraw') {
        const next = applyPlayerDraw(state, context?.baseScores);
        if (!next) break;
        line.push({ type: 'draw' }); state = next;
      } else if (state.phase === 'cpuTurn') {
        const next = applyCpuTurn(state, context?.baseScores);
        if (!next) break;
        line.push({ type: 'cpu-turn' }); state = next;
      } else if (state.phase === 'naki') {
        if (completed.size === kanFaces.length && state.ronAvailable) {
          const win = applyCallRon(state);
          if (win) consider(win, line, 'ron');
        }
        const next = applyPassNaki(state);
        if (!next) break;
        line.push({ type: 'pass-naki' }); state = next;
      } else if (state.phase === 'playerDiscard' && state.playerDrawnTile) {
        if (completed.size === kanFaces.length && state.tsumoAvailable) {
          const win = applyDeclareTsumo(state);
          if (win) consider(win, line, 'tsumo');
        }
        if (state.tsumoAvailable) {
          state = applyPassTsumo(state)!;
          line.push({ type: 'pass-tsumo' });
        }
        const pending = kanFaces.filter(f => !completed.has(f));
        if (pending.length) {
          const options = findLegalAnkanOptions(state.playerHand, state.playerDrawnTile, state.playerFuro, state.isRiichi);
          // The wall determines the order. Simultaneously available quads
          // use canonical order: after both kans the same tiles and dead wall
          // remain, so reversing them would duplicate the continuation.
          const option = pending.map(f => options.find(o => face(o.tiles[0]) === f)).find(o => o);
          if (option) {
            if (riichiBefore === completed.size + 1 && !state.isRiichi) break;
            const next = applyDeclareKan(state, option, context?.baseScores);
            if (!next) break;
            line.push({ type: 'ankan', option }); state = next; completed.add(face(option.tiles[0]));
            continue;
          }
          // A riichi hand cannot keep an unrelated draw or change its target.
          if (state.isRiichi && pending.includes(face(state.playerDrawnTile!))) break;
        }
        const all = [...state.playerHand, state.playerDrawnTile!];
        const held = counts(all);
        const extra = state.isRiichi ? [state.playerDrawnTile!] : [...all].reverse().filter(t =>
          held[face(t)] > (pending.includes(face(t)) ? 4 : target.counts[face(t)]));
        const discard = extra.find(t => !t.isRed && !target.waits.includes(face(t))) ?? extra.find(t => !t.isRed) ?? extra[0];
        if (!discard) break;
        let next = applyPlayerDiscard(state, discard);
        if (!next) break;
        let riichi = false;
        if (!state.isRiichi && next.phase !== 'exhausted' && canRiichi(state.playerHand, state.playerDrawnTile, state.playerFuro)) {
          const afterCounts = counts(next.playerHand);
          const waits = getWaits(next.playerHand, next.playerFuro).map(face);
          const tenpai = waits.length > 0;
          if (riichiBefore === completed.size + 1 && pending.length) {
            // Declare on the last own discard before drawing the fourth copy.
            const offset = playerDrawOffset(next);
            const nextOwnFace = offset < next.wall.length ? face(next.wall[offset]) : -1;
            riichi = tenpai && pending.some(f => afterCounts[f] === 3 && nextOwnFace === f);
          } else if (!pending.length) {
            // Last-discard riichi only when a future own draw remains and the
            // next CPU discard or next own draw can win with this actual wait.
            const offset = playerDrawOffset(next);
            riichi = tenpai && offset < next.wall.length &&
              next.wall.slice(0, offset + 1).some(tile => waits.includes(face(tile)));
          }
        }
        if (riichi) next = { ...next, isRiichi: true, isIppatsu: true };
        line.push({ type: 'discard', tile: discard, riichi }); state = next;
      } else break;
    }
  };

  for (let kanCount = 1; kanCount <= maxKans && Date.now() < deadline; kanCount++) {
    // Reserve half of the total time for two kans. Unused time carries over.
    stageDeadline = maxKans === 2 && kanCount === 1 ? Math.min(deadline, started + maxDurationMs / 2) : deadline;
    const liveWall = initial.wall.slice(0, -kanCount);
    const ownDraws = liveWall.filter((_, i) => isPlayerWallIndex(initial, i));
    const beforeKanPool = [...initial.playerHand, ...ownDraws];
    const rinshan = initial.wanpai.slice(0, kanCount);
    const pool = [...beforeKanPool, ...rinshan];
    // A quad cannot depend on the rinshan tile drawn after that same quad.
    const kanMaterialPool = [...beforeKanPool, ...rinshan.slice(0, -1)];
    const available = counts(kanMaterialPool);
    const beforeKanCounts = counts(beforeKanPool);
    const faces = available.flatMap((n, f) => n >= 4 ? [f] : []);
    const initialCounts = counts(initial.playerHand);
    const readyAt = (f: number) => {
      if (initialCounts[f] >= 4 || (kanCount === 2 && initialCounts[f] >= 3 && face(rinshan[0]) === f)) return 0;
      let n = initialCounts[f];
      for (let i = 0; i < ownDraws.length; i++) if (face(ownDraws[i]) === f && ++n >= 4) return i + 1;
      return ownDraws.length + 1;
    };
    // Unordered face sets avoid duplicate pair enumeration. The smaller
    // post-kan hand is generated once, independent of kan order or riichi.
    const sets = kanCount === 1 ? faces.map(f => [f])
      : faces.flatMap((f, i) => faces.slice(i + 1).map(g => [f, g]));
    sets.sort((a, b) => a.reduce((n, f) => n + readyAt(f), 0) - b.reduce((n, f) => n + readyAt(f), 0));
    for (const kanFaces of sets) {
      if (Date.now() >= stageDeadline) break;
      // At least the first quad must be obtainable without any rinshan draw.
      if (!kanFaces.some(f => beforeKanCounts[f] >= 4)) continue;
      combinations++;
      const targetState: State = { ...initial,
        playerHand: pool.filter(t => !kanFaces.includes(face(t))), wall: [],
        playerFuro: kanFaces.map(f => {
          const quad = pool.filter(t => face(t) === f).slice(0, 4);
          return { type: 'ankan', tiles: quad, calledTile: quad[0] };
        }) };
      const winningFaces = new Set([...liveWall, ...rinshan].map(face));
      const targets = enumerateTenpaiCandidates(targetState, { shouldStop: () => Date.now() >= stageDeadline });
      for (const target of targets) {
        if (Date.now() >= stageDeadline) break;
        if ((best?.bestScore ?? -1) >= TENPAI_DRAW_POINTS && !target.waits.some(wait => winningFaces.has(wait))) continue;
        run(kanFaces, target, 0);
        if (!initial.isRiichi) for (let nth = 1; nth <= kanCount; nth++) run(kanFaces, target, nth);
      }
    }
    timeLimitReached ||= Date.now() >= stageDeadline;
    onProgress?.(best);
  }
  if (best && best !== baseline) best.stats = { statesVisited: visited, cacheHits, prunedBranches: 0,
    elapsedMs: Date.now() - started, ankanCombinations: combinations, replayedLines, timeLimitReached };
  return best;
}

import type { Tile, Wind, Furo } from '@/types';
import type { State } from '@/game/gameState';
import type { SolverAction, SolverResult } from '@/game/solver';
import { findNakiOptions, findKakanOptions, nextDoraTile, type NakiOption } from '@/gameLogic';
import { isPlayerWallIndex, wallSeatAt, seatAfter } from '@/game/seatFlow';
import { enumerateTenpaiCandidates, type TenpaiCandidate } from '@/game/tenpaiCandidates';
import { scoreHand } from '@/game/scoreAdapter';
import { applyPlayerDraw, applyCpuTurn, applyPlayerDiscard, applyPlayerNakiDiscard,
  applyCallNaki, applyDeclareKan, applyPassNaki, applyPassTsumo, applyCallRon, applyDeclareTsumo } from '@/game/transitions';

const face = (t: Tile) => (t.suit === 'man' ? 0 : t.suit === 'pin' ? 9 : t.suit === 'sou' ? 18 : t.suit === 'wind' ? 27 : 31) + t.value - 1;
const countsOf = (tiles: Tile[]) => {
  const counts = Array<number>(34).fill(0);
  for (const t of tiles) counts[face(t)]++;
  return counts;
};
const optionKey = (o: NakiOption) => o.type + ':' + o.tiles
  .map(t => `${face(t)}:${!!t.isRed}`).sort().join(',');

/** Optimistic bound for open hands. Overlapping/incompatible yaku
 * may be added; only the actual scorer can accept a winning line. */
export function openHanUpperBound(initial: State, concealed: number[], meld: Tile[], pool: Tile[]): number {
  if (initial.playerFuro.filter(f => f.tiles.length === 4).length === 4) return Infinity; const all = [...concealed];
  for (const t of meld) all[face(t)]++;
  const faces = all.flatMap((n, i) => n ? [i] : []);
  const terminal = (i: number) => i >= 27 || i % 9 === 0 || i % 9 === 8;
  const trip = (i: number) => all[i] >= 3;
  // Possible open yakuman. A deliberately loose bound also covers alternate decompositions.
  if (faces.every(i => i >= 27) || faces.every(i => i < 27 && terminal(i)) ||
      faces.every(i => [19,20,21,23,25,32].includes(i)) ||
      [31,32,33].every(trip) ||
      [27,28,29,30].filter(trip).length >= 3 && [27,28,29,30].every(i => all[i] >= 2)) return Infinity;
  let han = 1; // At most one of haitei/houtei; never riichi, ippatsu or menzen tsumo.
  const suits = new Set(faces.filter(i => i < 27).map(i => Math.floor(i / 9)));
  const honors = faces.some(i => i >= 27);
  if (suits.size === 1) han += honors ? 2 : 5;
  if (faces.every(i => !terminal(i))) han++;
  for (const i of [31,32,33]) if (trip(i)) han++;
  for (const wind of [initial.playerWind, initial.roundWind])
    if (trip(27 + ['east','south','west','north'].indexOf(wind))) han++;
  if (faces.filter(trip).length >= 4) han += 2;
  if (concealed.filter(n => n >= 3).length >= 3) han += 2;
  if (Array.from({ length: 9 }, (_, i) => i).some(i => [i,i+9,i+18].every(trip))) han += 2;
  if ([31,32,33].filter(trip).length >= 2 && [31,32,33].every(i => all[i] >= 2)) han += 2;
  if (faces.every(terminal)) han += 2;
  // Necessary, not sufficient conditions for chanta/junchan.
  if (faces.every(i => i >= 27 || [0,1,2,6,7,8].includes(i % 9))) han += honors ? 1 : 2;
  if ([0,9,18].some(base => Array.from({ length: 9 }, (_, i) => all[base+i]).every(Boolean))) han++;
  if (Array.from({ length: 7 }, (_, i) => i).some(i =>
    [0,9,18].every(base => [0,1,2].every(d => all[base+i+d] > 0)))) han++;
  if (initial.playerFuro.filter(f => f.tiles.length === 4).length >= 3) han += 2;
  // Repeated indicators stack: two hatsu indicators make each chun worth two dora.
  for (const indicator of initial.wanpai.slice(4, 4 + initial.doraCount))
    han += all[face(nextDoraTile(indicator))];
  const reds = countsOf(pool.concat(meld).filter(t => t.isRed));
  for (let i = 0; i < 34; i++) han += Math.min(reds[i], all[i]);
  return han;
}

export interface OpenSearchStats {
  callCandidates: number; targets: number; prunedTargets: number; replayedLines: number;
  elapsedMs: number; timeLimitReached: boolean;
  twoCallCandidates: number;
  threeCallCandidates: number; fourCallCandidates: number; stageMs: number[];
  kakanPlans: number; maxOperations: number; plansByOperations: number[];
}

/** Compatibility entry point for the one-call search. */
export function searchWithOneOpenCall(initial: State, baseline: SolverResult | null,
  maxDurationMs = 4000, onStats?: (stats: OpenSearchStats) => void): SolverResult | null {
  return searchWithOpenCalls(initial, baseline, maxDurationMs, 1, onStats);
}

interface PlannedCall { index: number; option: NakiOption; fromWind: Wind }

/** Experimental DFS over chi/pon/daiminkan and subsequent kakan opportunities.
 * maxCalls bounds melds, not operations. Four melds allow up to eight operations.
 * Only haneman-or-better improvements over the closed baseline are eligible.
 * Ankan/open combinations are outside this experiment. */
export function searchWithOpenCalls(initial: State, baseline: SolverResult | null,
  maxDurationMs = 50000, maxCalls: 1 | 2 | 3 | 4 = 4, onStats?: (stats: OpenSearchStats) => void,
  onProgress?: (result: SolverResult | null) => void): SolverResult | null {
  if (initial.playerFuro.length || initial.playerDrawnTile || initial.isRiichi ||
      initial.playerHand.length !== 13 || !['playerDraw','cpuTurn'].includes(initial.phase)) return baseline;
  const start = Date.now();
  const stageDeadline = start + maxDurationMs;
  const expired = () => Date.now() >= stageDeadline;
  const stats: OpenSearchStats = { callCandidates: 0, targets: 0, prunedTargets: 0,
    replayedLines: 0, elapsedMs: 0, timeLimitReached: false, twoCallCandidates: 0, threeCallCandidates: 0, fourCallCandidates: 0, stageMs: [],
    kakanPlans: 0, maxOperations: 0, plansByOperations: Array(9).fill(0) };
  let best = baseline;
  let bestDraws = Infinity;
  const minimum = initial.playerWind === 'east' ? 18000 : 12000;
  const neededHan = () => {
    // A same-score open route can still improve the winning time; a tie with
    // the closed baseline can never replace it.
    const score = Math.max(baseline?.bestScore ?? 0, (best?.bestScore ?? 0) - 1);
    const unit = initial.playerWind === 'east' ? 1.5 : 1;
    return score >= 32000 * unit ? Infinity : score >= 24000 * unit ? 13 :
      score >= 16000 * unit ? 11 : score >= 12000 * unit ? 8 : 6;
  };
  const consider = (win: State | null, line: SolverAction[]) => {
    if (!win) return;
    const analysis = scoreHand(win);
    if (!analysis?.valid || !analysis.handInterpretations.length) return;
    const value = Math.max(...analysis.handInterpretations.map(h => h.totalWinnings));
    if (value < minimum || value <= (baseline?.bestScore ?? -1) || value < (best?.bestScore ?? -1) ||
        value === best?.bestScore && win.wallDrawnCount >= bestDraws) return;
    bestDraws = win.wallDrawnCount;
    const action: SolverAction = win.winType === 'ron'
      ? { type: 'ron', tile: win.winTile!, score: value, riichi: false, lastMomentRiichi: false }
      : { type: 'tsumo', score: value, riichi: false, lastMomentRiichi: false };
    best = { supported: true, complete: false, outcome: 'win', bestScore: value,
      line: [...line, action], stats: { statesVisited: stats.targets, cacheHits: 0,
        prunedBranches: stats.prunedTargets, elapsedMs: Date.now() - start } };
    onProgress?.(best);
  };
  const run = (plan: PlannedCall[], target: TenpaiCandidate) => {
    stats.replayedLines++;
    let state = initial;
    const line: SolverAction[] = [];
    let completed = 0;
    const pendingNeeds = plan.map((_, i) => countsOf(plan.slice(i).flatMap(c => c.option.tiles)));
    const pendingReds = plan.map((_, i) => countsOf(plan.slice(i).flatMap(c => c.option.tiles).filter(t => t.isRed)));
    for (let guard = 0; guard < 320 && !expired(); guard++) {
      let next: State | null = null;
      let action: SolverAction;
      if (state.phase === 'playerDraw') { action = { type: 'draw' }; next = applyPlayerDraw(state); }
      else if (state.phase === 'cpuTurn') { action = { type: 'cpu-turn' }; next = applyCpuTurn(state); }
      else if (state.phase === 'naki') {
        const pending = plan[completed];
        if (pending && pending.option.type !== 'kakan' && state.wallDrawnCount === initial.wallDrawnCount + pending.index + 1) {
          const option = state.nakiOptions.find(o => optionKey(o) === optionKey(pending.option));
          if (!option) return;
          action = { type: 'call-naki', option };
          next = option.type === 'daiminkan' ? applyDeclareKan(state, option) : applyCallNaki(state, option);
          completed++;
        } else {
          if (completed === plan.length && state.ronAvailable) consider(applyCallRon(state), line);
          action = { type: 'pass-naki' }; next = applyPassNaki(state);
        }
      } else if (state.phase === 'playerDiscard' || state.phase === 'playerNakiDiscard') {
        const pending = plan[completed];
        if (pending?.option.type === 'kakan' && state.phase === 'playerDiscard' &&
            state.wallDrawnCount === initial.wallDrawnCount + pending.index + 1) {
          const option = findKakanOptions(state.playerHand,state.playerDrawnTile,state.playerFuro)
            .find(o => optionKey(o) === optionKey(pending.option));
          if (!option) return;
          next = applyDeclareKan(state,option);
          if (!next) return;
          line.push({type:'ankan',option}); // Existing replay action dispatches any declared kan.
          state = next; completed++; continue;
        }
        if (completed === plan.length && state.tsumoAvailable) consider(applyDeclareTsumo(state), line);
        if (state.tsumoAvailable) { action = { type: 'pass-tsumo' }; next = applyPassTsumo(state); }
        else {
          const all = [...state.playerHand, ...(state.playerDrawnTile ? [state.playerDrawnTile] : [])];
          const held = countsOf(all);
          const heldReds = countsOf(all.filter(t => t.isRed));
          const callNeeds = pendingNeeds[completed] ?? Array<number>(34).fill(0);
          const callReds = pendingReds[completed] ?? Array<number>(34).fill(0);
          const extra = [...all].reverse().filter(t =>
            held[face(t)] > target.counts[face(t)] + callNeeds[face(t)] &&
            (t.isRed ? heldReds[face(t)] > callReds[face(t)] :
              held[face(t)] - heldReds[face(t)] > callNeeds[face(t)] - callReds[face(t)]));
          const tile = extra.find(t => !t.isRed) ?? extra[0];
          if (!tile) return;
          action = { type: 'discard', tile };
          next = state.phase === 'playerNakiDiscard' ? applyPlayerNakiDiscard(state, tile) : applyPlayerDiscard(state, tile);
        }
      } else return;
      if (!next) return;
      line.push(action); state = next;
      if (plan[completed] && state.wallDrawnCount > initial.wallDrawnCount + plan[completed].index + 1) return;
    }
  };
  const evaluatePlan = (plan: PlannedCall[], before: Tile[]) => {
      stats.callCandidates++;
      stats.plansByOperations[plan.length]++;
      stats.maxOperations = Math.max(stats.maxOperations,plan.length);
      if (plan.some(c => c.option.type === 'kakan')) stats.kakanPlans++;
      if (plan.length === 2) stats.twoCallCandidates++;
      if (plan.length === 3) stats.threeCallCandidates++; if (plan.length === 4) stats.fourCallCandidates++;
      const pool = [...before];
      const kans = plan.filter(c => ['daiminkan','kakan'].includes(c.option.type)).length;
      const stride = initial.mode === 'four' ? 4 : 2;
      for (let j = plan[plan.length-1].index + stride; j < initial.wall.length - kans; j += stride) pool.push(initial.wall[j]);
      const furo = meldsFor(plan);
      const meld = furo.flatMap(f => f.tiles);
      const targetState = { ...initial, playerHand: pool, playerDrawnTile: null, wall: [],
        playerFuro: furo, doraCount: initial.doraCount + kans };
      enumerateTenpaiCandidates(targetState, {
        allowOpen: true, shouldStop: expired,
        accept: target => {
          stats.targets++;
          const possible = target.waits.some(wait => {
            const counts = [...target.counts]; counts[wait]++;
            return openHanUpperBound(targetState, counts, meld, pool.concat(initial.wall)) >= neededHan();
          });
          if (possible) run(plan, target); else stats.prunedTargets++;
          return false; // Stream candidates instead of retaining every shape.
        },
      });
  };
  function meldsFor(plan: PlannedCall[]): Furo[] {
    const furo: Furo[] = [];
    for (const {option,index,fromWind} of plan) {
      if (option.type === 'kakan') {
        const i = furo.findIndex(f => f.type === 'pung' && face(f.tiles[0]) === face(option.tiles[0]));
        if (i < 0) throw new Error('Kakan without prior pon');
        furo[i] = {...furo[i],type:'kakan',tiles:[...furo[i].tiles,...option.tiles]};
      } else furo.push({type:option.type,tiles:[...option.tiles,initial.wall[index]],
        calledTile:initial.wall[index],fromWind});
    }
    return furo;
  }
  // No operation-count cutoff: each pon can be upgraded once; at most four
  // melds and four kans naturally limit the tree to eight operations.
  function ownKans(index: number, before: Tile[], plan: PlannedCall[]) {
    const kans = plan.filter(c => ['daiminkan','kakan'].includes(c.option.type)).length;
    if (expired() || initial.wanpai.length < 14 || initial.doraCount+kans >= 5 ||
        index+1 >= initial.wall.length-kans) return;
    const options = findKakanOptions(before,null,meldsFor(plan));
    for (const option of options) {
      if (expired()) return;
      const remaining = before.filter(t => t.id !== option.tiles[0].id);
      remaining.push(initial.wanpai[kans]);
      const nextPlan = [...plan,{index,option,fromWind:initial.playerWind}];
      evaluatePlan(nextPlan,remaining);
      ownKans(index,remaining,nextPlan); // A rinshan can enable another kakan.
      enumeratePlans(index+1,seatAfter(initial.playerWind),false,remaining,nextPlan);
    }
  }
  function enumeratePlans(startIndex: number, nextWind: Wind, nextOwn: boolean,
    available: Tile[], plan: PlannedCall[]) {
    const before = [...available];
    const kans = plan.filter(c => ['daiminkan','kakan'].includes(c.option.type)).length;
    const meldCount = plan.filter(c => c.option.type !== 'kakan').length;
    let wind = nextWind;
    let own = nextOwn;
    for (let index = startIndex; index < initial.wall.length - kans && !expired(); index++) {
      const discard = initial.wall[index];
      const isOwn = initial.mode === 'four' ? wind === initial.playerWind : own;
      const fromWind = initial.mode === 'four' ? wind : initial.cpuWind;
      wind = seatAfter(wind); own = !own;
      if (isOwn) { before.push(discard); ownKans(index,before,plan); continue; }
      if (meldCount >= maxCalls) continue;
      const options = findNakiOptions(before, discard).filter(o => o.type === 'pung' ||
        o.type === 'daiminkan' && initial.wanpai.length >= 14 && initial.doraCount + kans < 5 &&
          index + 1 < initial.wall.length - kans ||
        o.type === 'chii' && (initial.mode !== 'four' || fromWind === seatAfter(initial.playerWind, 3)));
      const seen = new Set<string>();
      for (const option of options) {
        if (expired()) return;
        const key = optionKey(option);
        if (seen.has(key)) continue;
        seen.add(key);
        const used = new Set(option.tiles.map(t => t.id));
        const remaining = before.filter(t => !used.has(t.id));
        // A kan consumes one live-wall tail tile and draws the next rinshan.
        // Front wall indices stay unchanged; the next opponent follows our discard.
        if (option.type === 'daiminkan') remaining.push(initial.wanpai[kans]);
        const nextPlan = [...plan, { index, option, fromWind }];
        evaluatePlan(nextPlan, remaining);
        if (option.type === 'daiminkan') ownKans(index,remaining,nextPlan);
        enumeratePlans(index + 1, seatAfter(initial.playerWind), false, remaining, nextPlan);
      }
    }
  }
  enumeratePlans(0,wallSeatAt(initial,0),isPlayerWallIndex(initial,0),initial.playerHand,[]);
  if (expired()) stats.timeLimitReached = true;
  onProgress?.(best);
  stats.elapsedMs = Date.now() - start;
  onStats?.(stats);
  return best;
}

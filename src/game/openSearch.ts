import type { Tile, Wind, Furo } from '@/types';
import type { State } from '@/game/gameState';
import type { SolverAction, SolverResult } from '@/game/solver';
import { findNakiOptions, findAnkanOptions, findKakanOptions, nextDoraTile, getWaits, type NakiOption } from '@/gameLogic';
import { isPlayerWallIndex, wallSeatAt, nextSeat, isTableMode, drawStride, hasFuturePlayerDraw } from '@/game/seatFlow';
import { enumerateTenpaiCandidates, type TenpaiCandidate } from '@/game/tenpaiCandidates';
import { analyzeSearchHand, type SearchContext } from '@/game/searchContext';
import { threePlayerScoreUpperBound } from '@/game/scoreUpperBound';
import { applyPlayerDraw, applyCpuTurn, applyPlayerDiscard, applyPlayerNakiDiscard,
  applyCallNaki, applyDeclareKan, applyPassNaki, applyPassTsumo, applyCallRon, applyDeclareTsumo, applyNuki, findNukiOptions } from '@/game/transitions';

const face = (t: Tile) => (t.suit === 'man' ? 0 : t.suit === 'pin' ? 9 : t.suit === 'sou' ? 18 : t.suit === 'wind' ? 27 : 31) + t.value - 1;
const countsOf = (tiles: Tile[]) => {
  const counts = Array<number>(34).fill(0);
  for (const t of tiles) counts[face(t)]++;
  return counts;
};
type PlannedOption = NakiOption | { type: 'nuki'; tiles: Tile[] };
const optionKey = (o: PlannedOption) => o.type + ':' + o.tiles
  .map(t => `${face(t)}:${!!t.isRed}`).sort().join(',');

/** Optimistic bound for open hands. Overlapping/incompatible yaku
 * may be added; only the actual scorer can accept a winning line. */
export function openHanUpperBound(initial: State, concealed: number[], meld: Tile[], pool: Tile[]): number {
  if (initial.playerFuro.filter(f => f.tiles.length === 4).length === 4) return Infinity;
  const all = [...concealed];
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
  if (concealed.filter(n => n >= 3).length + initial.playerFuro.filter(f => f.type === 'ankan').length >= 3) han += 2;
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
    han += all[face(nextDoraTile(indicator, initial.mode))];
  han += initial.playerNuki?.length ?? 0;
  const reds = countsOf(pool.concat(meld).filter(t => t.isRed));
  for (let i = 0; i < 34; i++) han += Math.min(reds[i], all[i]);
  return han;
}

export interface OpenSearchStats {
  callCandidates: number; targets: number; prunedTargets: number; replayedLines: number;
  elapsedMs: number; timeLimitReached: boolean;
  twoCallCandidates: number;
  threeCallCandidates: number; fourCallCandidates: number;
  kakanPlans: number; maxOperations: number; plansByOperations: number[];
  preparedNukiCount?: number;
  scoreBounds?: number;
  unreachableTargets?: number;
}

/** Fix the usual north-extraction schedule before enumerating any hand shapes. */
export function searchWithNuki(initial: State, baseline: SolverResult | null,
  maxDurationMs = 6000, onStats?: (stats: OpenSearchStats) => void,
  onProgress?: (result: SolverResult | null) => void, context?: SearchContext): SolverResult | null {
  if (initial.mode !== 'three') return baseline;
  return searchWithOpenCalls(initial, baseline, maxDurationMs, 4, onStats, onProgress, 'eager-nuki', context);
}

/** Compatibility entry point for the one-call search. */
export function searchWithOneOpenCall(initial: State, baseline: SolverResult | null,
  maxDurationMs = 4000, onStats?: (stats: OpenSearchStats) => void): SolverResult | null {
  return searchWithOpenCalls(initial, baseline, maxDurationMs, 1, onStats);
}

interface PlannedCall { index: number; option: PlannedOption; fromWind: Wind }
interface WinningMaterial { tile: Tile; available: number[] }

/** DFS over calls, kans and three-player north extractions.
 * maxCalls bounds melds, not operations. Four melds allow up to eight operations.
 * When the closed baseline is below mangan, lower open wins are eligible too.
 * Includes ankan before or after open calls, and closed north-extraction lines. */
export function searchWithOpenCalls(initial: State, baseline: SolverResult | null,
  maxDurationMs = 50000, maxCalls: 1 | 2 | 3 | 4 = 4, onStats?: (stats: OpenSearchStats) => void,
  onProgress?: (result: SolverResult | null) => void,
  strategy: 'all' | 'eager-nuki' = 'all', context?: SearchContext): SolverResult | null {
  if (initial.playerFuro.length || initial.playerDrawnTile || initial.isRiichi ||
      initial.playerHand.length !== 13 || !['playerDraw','cpuTurn'].includes(initial.phase)) return baseline;
  const start = Date.now();
  const unit = initial.playerWind === 'east' ? 1.5 : 1;
  const allowLowOpen = (baseline?.bestScore ?? 0) < 8000 * unit;
  let lowPhase = initial.mode === 'three';
  // Reserve time for the fallback, but try the cheaper high-score search first.
  let stageDeadline = start + maxDurationMs * (allowLowOpen && initial.mode !== 'three' ? 0.5 : 1);
  const expired = () => Date.now() >= stageDeadline || !!context?.shouldStop();
  const stats: OpenSearchStats = { callCandidates: 0, targets: 0, prunedTargets: 0,
    replayedLines: 0, elapsedMs: 0, timeLimitReached: false, twoCallCandidates: 0, threeCallCandidates: 0, fourCallCandidates: 0,
    kakanPlans: 0, maxOperations: 0, plansByOperations: Array(initial.mode === 'three' ? 13 : 9).fill(0) };
  let best = baseline;
  const eagerNuki = strategy === 'eager-nuki';
  const eagerOpportunities: WinningMaterial[] = [];
  let bestDraws = Infinity;
  const neededHan = () => {
    // A same-score open route can still improve the winning time; a tie with
    // the closed baseline can never replace it.
    const score = Math.max(baseline?.bestScore ?? 0, (best?.bestScore ?? 0) - 1);
    // Below mangan, fu also changes points. Do not infer a minimum han from
    // points alone: keep all potentially valid hands and compare actual scores.
    return score >= 32000 * unit ? Infinity : score >= 24000 * unit ? 13 :
      score >= 16000 * unit ? 11 : score >= 12000 * unit ? 8 :
      score >= 8000 * unit || !lowPhase ? 6 : 1;
  };
  const consider = (win: State | null, line: SolverAction[]) => {
    if (!win) return;
    const analysis = analyzeSearchHand(win, context);
    if (!analysis?.valid || !analysis.handInterpretations.length) return;
    const value = Math.max(...analysis.handInterpretations.map(h => h.totalWinnings));
    if ((!lowPhase && value < 12000 * unit) || value <= (baseline?.bestScore ?? -1) || value < (best?.bestScore ?? -1) ||
        value === best?.bestScore && win.wallDrawnCount >= bestDraws) return;
    bestDraws = win.wallDrawnCount;
    const action: SolverAction = win.winType === 'ron'
      ? { type: 'ron', tile: win.winTile!, score: value, riichi: win.isRiichi, lastMomentRiichi: false }
      : { type: 'tsumo', score: value, riichi: win.isRiichi, lastMomentRiichi: false };
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
      if (state.phase === 'playerDraw') { action = { type: 'draw' }; next = applyPlayerDraw(state, context?.baseScores); }
      else if (state.phase === 'cpuTurn') { action = { type: 'cpu-turn' }; next = applyCpuTurn(state, context?.baseScores); }
      else if (state.phase === 'naki') {
        const pending = plan[completed];
        if (pending && !['kakan','ankan','nuki'].includes(pending.option.type) && state.wallDrawnCount === initial.wallDrawnCount + pending.index + 1) {
          const option = state.nakiOptions.find(o => optionKey(o) === optionKey(pending.option));
          if (!option) return;
          action = { type: 'call-naki', option };
          next = option.type === 'daiminkan' ? applyDeclareKan(state, option, context?.baseScores) : applyCallNaki(state, option);
          completed++;
        } else {
          if ((eagerNuki || completed === plan.length) && state.ronAvailable) consider(applyCallRon(state), line);
          action = { type: 'pass-naki' }; next = applyPassNaki(state);
        }
      } else if (state.phase === 'playerDiscard' || state.phase === 'playerNakiDiscard') {
        const pending = plan[completed];
        if (pending?.option.type === 'nuki' && state.phase === 'playerDiscard' &&
            state.wallDrawnCount === initial.wallDrawnCount + pending.index + 1) {
          const north = findNukiOptions(state)[0];
          next = north ? applyNuki(state, north, context?.baseScores) : null;
          if (!next || !north) return;
          line.push({ type: 'nuki', tile: north });
          state = next; completed++; continue;
        }
        if (pending && ['kakan','ankan'].includes(pending.option.type) && state.phase === 'playerDiscard' &&
            state.wallDrawnCount === initial.wallDrawnCount + pending.index + 1) {
          const options = pending.option.type === 'ankan'
            ? findAnkanOptions(state.playerHand,state.playerDrawnTile)
            : findKakanOptions(state.playerHand,state.playerDrawnTile,state.playerFuro);
          const option = options
            .find(o => optionKey(o) === optionKey(pending.option));
          if (!option) return;
          next = applyDeclareKan(state,option, context?.baseScores);
          if (!next) return;
          line.push({type:option.type === 'ankan' ? 'ankan' : 'kakan',option});
          state = next; completed++; continue;
        }
        if ((eagerNuki || completed === plan.length) && state.tsumoAvailable) consider(applyDeclareTsumo(state), line);
        if (state.tsumoAvailable) { action = { type: 'pass-tsumo' }; next = applyPassTsumo(state); }
        else {
          const all = [...state.playerHand, ...(state.playerDrawnTile ? [state.playerDrawnTile] : [])];
          const held = countsOf(all);
          const heldReds = countsOf(all.filter(t => t.isRed));
          const callNeeds = pendingNeeds[completed] ?? Array<number>(34).fill(0);
          const callReds = pendingReds[completed] ?? Array<number>(34).fill(0);
          const extra = [...all].reverse().filter(t =>
            (!state.isRiichi || t.id === state.playerDrawnTile?.id) &&
            held[face(t)] > target.counts[face(t)] + callNeeds[face(t)] &&
            (t.isRed ? heldReds[face(t)] > callReds[face(t)] :
              held[face(t)] - heldReds[face(t)] > callNeeds[face(t)] - callReds[face(t)]));
          const tile = extra.find(t => !t.isRed) ?? extra[0];
          if (!tile) return;
          action = { type: 'discard', tile };
          next = state.phase === 'playerNakiDiscard' ? applyPlayerNakiDiscard(state, tile) : applyPlayerDiscard(state, tile);
          if (next && initial.mode === 'three' && (eagerNuki || completed === plan.length) && !state.isRiichi &&
              state.playerFuro.every(f => f.type === 'ankan') && hasFuturePlayerDraw(next) &&
              getWaits(next.playerHand, next.playerFuro).length > 0) {
            // Eager extraction leaves no held north; future drawn north remains legal after riichi.
            next = { ...next, isRiichi: true, isIppatsu: true };
            action.riichi = true;
          }
        }
      } else return;
      if (!next) return;
      line.push(action); state = next;
      if (plan[completed] && state.wallDrawnCount > initial.wallDrawnCount + plan[completed].index + 1) return;
    }
  };
  const evaluatePlan = (plan: PlannedCall[], before: Tile[], includesFutureDraws = false) => {
      // Still expand closed prefixes so an ankan can precede the first call.
      // Do not score them as open hands or displace the closed baseline on a tie.
      if (!plan.some(c => c.option.type !== 'ankan')) return;
      stats.callCandidates++;
      stats.plansByOperations[plan.length]++;
      stats.maxOperations = Math.max(stats.maxOperations,plan.length);
      if (plan.some(c => c.option.type === 'kakan')) stats.kakanPlans++;
      if (plan.length === 2) stats.twoCallCandidates++;
      if (plan.length === 3) stats.threeCallCandidates++; if (plan.length === 4) stats.fourCallCandidates++;
      const pool = [...before];
      const kans = plan.filter(c => ['daiminkan','kakan','ankan'].includes(c.option.type)).length;
      const nukis = plan.filter(c => c.option.type === 'nuki');
      const stride = drawStride(initial);
      if (!includesFutureDraws) for (let j = plan[plan.length-1].index + stride; j < initial.wall.length - kans - nukis.length; j += stride) pool.push(initial.wall[j]);
      const furo = meldsFor(plan);
      const meld = furo.flatMap(f => f.tiles);
      const targetState = { ...initial, playerHand: pool, playerDrawnTile: null, wall: [],
        playerFuro: furo, doraCount: initial.doraCount + kans,
        playerNuki: [...(initial.playerNuki ?? []), ...nukis.flatMap(c => c.option.tiles)] };
      const material = pool.concat(initial.wall);
      const opportunities: WinningMaterial[] = includesFutureDraws ? eagerOpportunities : [];
      if (initial.mode === 'three' && !includesFutureDraws) {
        const last = plan[plan.length - 1];
        const available = countsOf(before);
        const replacement = last.option.type === 'nuki' ? initial.wall[initial.wall.length - kans - nukis.length]
          : ['ankan','kakan','daiminkan'].includes(last.option.type) ? initial.wanpai[kans - 1] : null;
        if (replacement) {
          const preceding = [...available]; preceding[face(replacement)]--;
          opportunities.push({ tile: replacement, available: preceding });
        }
        for (let j = last.index + 1; j < initial.wall.length - kans - nukis.length; j++) {
          const tile = initial.wall[j];
          opportunities.push({ tile, available: [...available] });
          if ((j - last.index) % stride === 0) available[face(tile)]++;
        }
      }
      enumerateTenpaiCandidates(targetState, {
        allowOpen: true, shouldStop: expired,
        accept: target => {
          stats.targets++;
          const reachable = initial.mode === 'three' ? opportunities.filter(event =>
            target.waits.includes(face(event.tile)) && target.counts.every((n, i) => n <= event.available[i])) : [];
          if (initial.mode === 'three' && !reachable.length) {
            stats.prunedTargets++; stats.unreachableTargets = (stats.unreachableTargets ?? 0) + 1;
            return false;
          }
          const possible = target.waits.some(wait => {
            const counts = [...target.counts]; counts[wait]++;
            const bound = initial.mode === 'three'
              ? threePlayerHanUpperBound(targetState, counts, meld, material)
              : openHanUpperBound(targetState, counts, meld, material);
            return bound >= neededHan();
          });
          let canImprove = possible;
          if (canImprove && initial.mode === 'three' && (best?.bestScore ?? -1) >= 3000) {
            stats.scoreBounds = (stats.scoreBounds ?? 0) + 1;
            const upper = threePlayerScoreUpperBound(targetState, target, pool, reachable.map(event => event.tile), context);
            canImprove = upper > (baseline?.bestScore ?? -1) && upper >= (best?.bestScore ?? -1);
          }
          if (canImprove) run(plan, target); else stats.prunedTargets++;
          return false; // Stream candidates instead of retaining every shape.
        },
      });
  };
  function meldsFor(plan: PlannedCall[]): Furo[] {
    const furo: Furo[] = [];
    for (const {option,index,fromWind} of plan) {
      if (option.type === 'nuki') continue;
      if (option.type === 'kakan') {
        const i = furo.findIndex(f => f.type === 'pung' && face(f.tiles[0]) === face(option.tiles[0]));
        if (i < 0) throw new Error('Kakan without prior pon');
        furo[i] = {...furo[i],type:'kakan',tiles:[...furo[i].tiles,...option.tiles]};
      } else if (option.type === 'ankan') {
        furo.push({type:'ankan',tiles:option.tiles,calledTile:option.tiles[0]});
      } else furo.push({type:option.type,tiles:[...option.tiles,initial.wall[index]],
        calledTile:initial.wall[index],fromWind});
    }
    return furo;
  }
  // Four melds, four kan upgrades and four physical north tiles bound the tree.
  function ownKans(index: number, before: Tile[], plan: PlannedCall[]) {
    const kans = plan.filter(c => ['daiminkan','kakan','ankan'].includes(c.option.type)).length;
    const nukis = plan.filter(c => c.option.type === 'nuki').length;
    const tailUsed = kans + nukis;
    if (expired() || index+1 >= initial.wall.length-tailUsed) return;
    const furo = meldsFor(plan);
    const north = before.find(t => t.suit === 'wind' && t.value === 4);
    const options: PlannedOption[] = initial.wanpai.length >= 14 && initial.doraCount+kans < 5
      ? [...findKakanOptions(before,null,furo), ...(furo.length < maxCalls ? findAnkanOptions(before,null) : [])] : [];
    if (initial.mode === 'three' && north) options.unshift({ type: 'nuki', tiles: [north] });
    for (const option of options) {
      if (expired()) return;
      const used = new Set(option.tiles.map(t => t.id));
      const remaining = before.filter(t => !used.has(t.id));
      remaining.push(option.type === 'nuki' ? initial.wall[initial.wall.length - 1 - tailUsed] : initial.wanpai[kans]);
      const nextPlan = [...plan,{index,option,fromWind:initial.playerWind}];
      evaluatePlan(nextPlan,remaining);
      ownKans(index,remaining,nextPlan); // A rinshan can enable another ankan or kakan.
      enumeratePlans(index+1,nextSeat(initial, initial.playerWind),false,remaining,nextPlan);
    }
  }
  function enumeratePlans(startIndex: number, nextWind: Wind, nextOwn: boolean,
    available: Tile[], plan: PlannedCall[]) {
    const before = [...available];
    const kans = plan.filter(c => ['daiminkan','kakan','ankan'].includes(c.option.type)).length;
    const nukis = plan.filter(c => c.option.type === 'nuki').length;
    const meldCount = plan.filter(c => c.option.type !== 'kakan' && c.option.type !== 'nuki').length;
    let wind = nextWind;
    let own = nextOwn;
    for (let index = startIndex; index < initial.wall.length - kans - nukis && !expired(); index++) {
      const discard = initial.wall[index];
      const isOwn = isTableMode(initial) ? wind === initial.playerWind : own;
      const fromWind = isTableMode(initial) ? wind : initial.cpuWind;
      wind = nextSeat(initial, wind); own = !own;
      if (isOwn) { before.push(discard); ownKans(index,before,plan); continue; }
      if (meldCount >= maxCalls) continue;
      const options = findNakiOptions(before, discard).filter(o => o.type === 'pung' ||
        o.type === 'daiminkan' && initial.wanpai.length >= 14 && initial.doraCount + kans < 5 &&
          index + 1 < initial.wall.length - kans - nukis ||
        o.type === 'chii' && initial.mode !== 'three' && (!isTableMode(initial) || fromWind === nextSeat(initial, initial.playerWind, -1)));
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
        enumeratePlans(index + 1, nextSeat(initial, initial.playerWind), false, remaining, nextPlan);
      }
    }
  }
  if (eagerNuki) {
    // No discard choice changes this schedule: consume all available north on
    // each own draw, including chained replacements, and shrink the tail once.
    // The accumulated material is shared by every target instead of generating
    // targets again for every extraction prefix and delayed-extraction choice.
    const before = [...initial.playerHand];
    const plan: PlannedCall[] = [];
    let tail = initial.wall.length;
    for (let index = 0; index < tail && !expired(); index++) {
      eagerOpportunities.push({ tile: initial.wall[index], available: countsOf(before) });
      if (!isPlayerWallIndex(initial, index)) continue;
      before.push(initial.wall[index]);
      let northIndex: number;
      while (index + 1 < tail && (northIndex = before.findIndex(t => t.suit === 'wind' && t.value === 4)) >= 0) {
        const [north] = before.splice(northIndex, 1);
        plan.push({ index, option: { type: 'nuki', tiles: [north] }, fromWind: initial.playerWind });
        const replacement = initial.wall[--tail];
        eagerOpportunities.push({ tile: replacement, available: countsOf(before) });
        before.push(replacement);
      }
    }
    stats.preparedNukiCount = plan.length;
    if (plan.length && !expired()) evaluatePlan(plan, before, true);
  } else enumeratePlans(0,wallSeatAt(initial,0),isPlayerWallIndex(initial,0),initial.playerHand,[]);
  if (expired()) stats.timeLimitReached = true;
  if (allowLowOpen && !lowPhase && (best?.bestScore ?? 0) < 8000 * unit) {
    lowPhase = true;
    stageDeadline = start + maxDurationMs;
    enumeratePlans(0,wallSeatAt(initial,0),isPlayerWallIndex(initial,0),initial.playerHand,[]);
    if (expired()) stats.timeLimitReached = true;
  }
  onProgress?.(best);
  stats.elapsedMs = Date.now() - start;
  onStats?.(stats);
  return best;
}

/** Conservative bound for both closed and open three-player targets.
 * Use the larger ron payout when deriving neededHan, so tsumo loss never
 * causes a potentially better hand to be pruned. Closed-only yakuman and
 * ura bonuses must be included before reusing the open-hand bound. */
export function threePlayerHanUpperBound(initial: State, concealed: number[], meld: Tile[], pool: Tile[]): number {
  let han = openHanUpperBound(initial, concealed, meld, pool);
  const all = [...concealed];
  for (const tile of meld) all[face(tile)]++;
  const northCount = initial.playerNuki?.length ?? 0;
  for (const indicator of initial.wanpai.slice(4, 4 + initial.doraCount)) {
    if (face(nextDoraTile(indicator, 'three')) === 30) han += northCount;
  }
  if (initial.playerFuro.some(f => f.type !== 'ankan')) return han;
  const orphans = [0,8,9,17,18,26,27,28,29,30,31,32,33];
  if (all.filter(n => n >= 3).length >= 4 || (!initial.playerFuro.length && orphans.every(i => all[i] > 0))) return Infinity;
  if (!initial.playerFuro.length && [0,9,18].some(base =>
    all[base] >= 3 && all[base + 8] >= 3 && all.slice(base, base + 9).every(n => n > 0))) return Infinity;
  // Riichi + ippatsu + tsumo (3), pinfu (1), ryanpeikou (3;
  // also bounds chiitoitsu), and the closed flush/chanta increments (2).
  han += 9;
  for (const indicator of initial.wanpai.slice(9, 9 + initial.doraCount)) {
    const doraFace = face(nextDoraTile(indicator, 'three'));
    han += all[doraFace] + (doraFace === 30 ? northCount : 0);
  }
  return han;
}

export { threePlayerScoreUpperBound } from '@/game/scoreUpperBound';

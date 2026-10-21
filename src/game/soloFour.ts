import { calculate, type HandAnalysis } from 'riichi-score';
import type { Furo, Tile, Wind } from '@/types';
import {
  createDeck, shuffle, sortHand, sameTile, tileKey,
  findNakiOptions, findLegalAnkanOptions, findKakanOptions,
  isMenzen, type NakiOption,
} from '@/gameLogic';
import { SEATS, seatAfter } from '@/game/seatFlow';
import type { State } from '@/game/gameState';
import { buildHandInput } from '@/game/scoreAdapter';
import { applyDeclareKan } from '@/game/transitions';

export const SEAT_NAMES: Record<Wind, string> = { east: '東', south: '南', west: '西', north: '北' };

export interface SoloSeat {
  hand: Tile[];
  drawn: Tile | null;
  discards: Tile[];
  furo: Furo[];
  points: number;
  riichi: boolean;
  doubleRiichi: boolean;
  riichiDiscardId?: string;
  ippatsu: boolean;
  temporaryFuriten: boolean;
  riichiFuriten: boolean;
  rinshan: boolean;
  forbiddenDiscards: string[];
}

interface Response {
  wind: Wind;
  ron: boolean;
  options: NakiOption[];
  choice?: 'pass' | 'ron' | NakiOption;
}

interface PendingDiscard {
  kind: 'discard' | 'ankan' | 'kakan';
  source: Wind;
  tile: Tile;
  responses: Response[];
  kan?: NakiOption;
  riichiDeposit?: boolean;
}

export interface SoloResult {
  type: 'ron' | 'tsumo' | 'draw';
  winners: { wind: Wind; analysis: HandAnalysis }[];
  tenpai: Wind[];
  delta: Record<Wind, number>;
}

export interface SoloState {
  seats: Record<Wind, SoloSeat>;
  wall: Tile[];
  fullWall: Tile[];
  wanpai: Tile[];
  doraCount: number;
  roundWind: Wind;
  turn: Wind;
  view: Wind;
  phase: 'discard' | 'riichi' | 'response' | 'end';
  pending: PendingDiscard | null;
  lastDiscard: { wind: Wind; tile: Tile } | null;
  pot: number;
  callsMade: boolean;
  result: SoloResult | null;
}

export type SoloAction =
  | { type: 'discard'; tileId: string }
  | { type: 'riichi' }
  | { type: 'cancelRiichi' }
  | { type: 'tsumo' }
  | { type: 'respond'; choice: 'pass' | 'ron' | NakiOption }
  | { type: 'kan'; option: NakiOption };

const tileTypes = createDeck().filter((tile, index) => index % 4 === 0)
  .map(tile => ({ ...tile, id: `wait:${tileKey(tile)}`, isRed: false }));
const zeros = (): Record<Wind, number> => ({ east: 0, south: 0, west: 0, north: 0 });

function kokushi(hand: Tile[]): boolean {
  if (hand.length !== 14) return false;
  const terminals = hand.every(t => t.suit === 'wind' || t.suit === 'dragon' || t.value === 1 || t.value === 9);
  return terminals && new Set(hand.map(tileKey)).size === 13;
}

function winningShape(hand: Tile[], furo: Furo[]): boolean {
  if (hand.length !== 14 - furo.length * 3) return false;
  if (furo.length === 0 && kokushi(hand)) return true;
  // Four identical tiles cannot count as two pairs in chiitoitsu.
  const counts = new Map<string, number>();
  for (const tile of hand) counts.set(tileKey(tile), (counts.get(tileKey(tile)) ?? 0) + 1);
  if (furo.length === 0 && [...counts.values()].every(count => count === 2)) return true;
  // The legacy helper also recognizes pairs; use a meld-only decomposition here.
  const melds = (tiles: Tile[]): boolean => {
    if (!tiles.length) return true;
    const first = tiles[0];
    const matching = tiles.filter(t => sameTile(t, first));
    if (matching.length >= 3) {
      const ids = new Set(matching.slice(0, 3).map(t => t.id));
      if (melds(tiles.filter(t => !ids.has(t.id)))) return true;
    }
    if (first.suit === 'wind' || first.suit === 'dragon') return false;
    const second = tiles.find(t => t.suit === first.suit && t.value === first.value + 1);
    const third = tiles.find(t => t.suit === first.suit && t.value === first.value + 2);
    if (!second || !third) return false;
    const ids = new Set([first.id, second.id, third.id]);
    return melds(tiles.filter(t => !ids.has(t.id)));
  };
  const sorted = sortHand(hand);
  return sorted.some((tile, i) => {
    if (!sorted[i + 1] || !sameTile(tile, sorted[i + 1])) return false;
    return melds(sorted.filter((_, j) => j !== i && j !== i + 1));
  });
}

export function soloWaits(seat: SoloSeat): Tile[] {
  const owned = [...seat.hand, ...seat.furo.flatMap(f => f.tiles)];
  return tileTypes.filter(tile => owned.filter(t => sameTile(t, tile)).length < 4 &&
    winningShape([...seat.hand, tile], seat.furo));
}

/** Adapter only: four permanent seats remain the source of truth. */
export function soloPerspective(state: SoloState, wind = state.view): State {
  const seat = state.seats[wind];
  return {
    mode: 'four', roundWind: state.roundWind, playerWind: wind, cpuWind: seatAfter(wind),
    cpuHand: [], cpuDiscards: [], cpuFuro: [], wall: state.wall, wanpai: state.wanpai,
    turnCount: seat.discards.length, nakiOptions: [], ronAvailable: false, tsumoAvailable: false,
    winType: null, winTile: null,
    playerHand: seat.hand, playerDrawnTile: seat.drawn, playerDiscards: seat.discards,
    playerFuro: seat.furo, isRiichi: seat.riichi, isIppatsu: seat.ippatsu,
    temporaryFuriten: seat.temporaryFuriten, missedRonAfterRiichi: seat.riichiFuriten,
    drawnFromRinshan: seat.rinshan, doraCount: state.doraCount, fullWall: state.fullWall,
    wallDrawnCount: state.fullWall.length - state.wall.length - (state.doraCount - 1),
    phase: state.phase === 'response' ? 'naki' : state.phase === 'riichi' ? 'riichiSelect' :
      state.phase === 'end' ? 'exhausted' : seat.drawn ? 'playerDiscard' : 'playerNakiDiscard',
    nextSeat: seatAfter(state.turn),
    lastCpuDiscard: state.lastDiscard?.tile ?? null,
    lastDiscardWind: state.pending?.source ?? state.lastDiscard?.wind,
    opponents: SEATS.filter(w => w !== wind).map(w => ({ wind: w, hand: state.seats[w].hand, discards: state.seats[w].discards })),
  };
}

export function soloScore(state: SoloState, wind: Wind, tile: Tile, type: 'ron' | 'tsumo', source?: Wind): HandAnalysis | null {
  const seat = state.seats[wind];
  if (!winningShape([...seat.hand, tile], seat.furo)) return null;
  const input = buildHandInput({
    ...soloPerspective(state, wind), phase: 'win', winType: type, winTile: tile,
    winFromWind: source, playerDrawnTile: type === 'tsumo' ? tile : null,
  });
  if (!input) return null;
  input.gameState.isDoubleRiichi = seat.doubleRiichi;
  input.gameState.isChankan = type === 'ron' && !!state.pending && state.pending.kind !== 'discard';
  input.gameState.isHoutei = type === 'ron' && state.wall.length === 0 && !input.gameState.isChankan;
  input.gameState.isHaitei = type === 'tsumo' && state.wall.length === 0 && !seat.rinshan;
  input.gameState.isTenhou = type === 'tsumo' && wind === 'east' && !state.callsMade && seat.discards.length === 0;
  input.gameState.isChiihou = type === 'tsumo' && wind !== 'east' && !state.callsMade && seat.discards.length === 0;
  const result = calculate(input);
  if (!result.valid || !result.handInterpretations.length) return null;
  result.handInterpretations.sort((a, b) => b.totalWinnings - a.totalWinnings);
  return result;
}

function updateSeat(state: SoloState, wind: Wind, update: Partial<SoloSeat>): SoloState {
  return { ...state, seats: { ...state.seats, [wind]: { ...state.seats[wind], ...update } } };
}

function cancelIppatsu(state: SoloState): SoloState {
  return { ...state, callsMade: true, seats: Object.fromEntries(SEATS.map(w => [w, { ...state.seats[w], ippatsu: false }])) as Record<Wind, SoloSeat> };
}

function settleDraw(state: SoloState): SoloState {
  const tenpai = SEATS.filter(w => soloWaits(state.seats[w]).length > 0);
  const delta = zeros();
  if (tenpai.length > 0 && tenpai.length < 4) {
    for (const w of SEATS) delta[w] = tenpai.includes(w) ? 3000 / tenpai.length : -3000 / (4 - tenpai.length);
  }
  return finish(state, { type: 'draw', winners: [], tenpai, delta });
}

function finish(state: SoloState, result: SoloResult): SoloState {
  return {
    ...state, phase: 'end', pending: null, result,
    view: result.winners[0]?.wind ?? state.view,
    seats: Object.fromEntries(SEATS.map(w => [w, { ...state.seats[w], points: state.seats[w].points + result.delta[w] }])) as Record<Wind, SoloSeat>,
  };
}

function win(state: SoloState, winds: Wind[], type: 'ron' | 'tsumo', tile: Tile, source?: Wind): SoloState {
  // A riichi declaration discarded into ron never becomes established.
  if (state.pending?.riichiDeposit && source) {
    state = updateSeat({ ...state, pot: state.pot - 1000 }, source, {
      points: state.seats[source].points + 1000, riichi: false, doubleRiichi: false,
      ippatsu: false, riichiDiscardId: undefined,
    });
  }
  const winners = winds.map(wind => ({ wind, analysis: soloScore(state, wind, tile, type, source)! }));
  const delta = zeros();
  for (const winner of winners) {
    for (const payment of winner.analysis.handInterpretations[0].seatPayments) {
      delta[payment.seat] -= payment.value;
      delta[winner.wind] += payment.value;
    }
  }
  delta[winds[0]] += state.pot;
  return finish({ ...state, pot: 0 }, { type, winners, delta, tenpai: [] });
}

function drawFor(state: SoloState, wind: Wind): SoloState {
  if (!state.wall.length) return settleDraw(state);
  const [drawn, ...wall] = state.wall;
  return updateSeat({ ...state, wall, turn: wind, view: wind, phase: 'discard', pending: null }, wind,
    { drawn, rinshan: false, temporaryFuriten: false, forbiddenDiscards: [] });
}

export function createSoloState(deck = shuffle(createDeck())): SoloState {
  const remaining = [...deck];
  const seats = Object.fromEntries(SEATS.map((wind): [Wind, SoloSeat] => [wind, {
    hand: sortHand(remaining.splice(0, 13)), drawn: null, discards: [], furo: [], points: 25000,
    riichi: false, doubleRiichi: false, ippatsu: false, temporaryFuriten: false,
    riichiFuriten: false, rinshan: false, forbiddenDiscards: [],
  }])) as Record<Wind, SoloSeat>;
  const wanpai = remaining.splice(-14);
  return drawFor({ seats, wall: remaining, fullWall: [...remaining], wanpai, doraCount: 1,
    roundWind: SEATS[Math.floor(Math.random() * SEATS.length)], turn: 'east', view: 'east', phase: 'discard', pending: null,
    lastDiscard: null, pot: 0, callsMade: false, result: null }, 'east');
}

/** Remaining-wall index -> future owner, assuming no further calls. */
export function soloWallSeat(state: SoloState, index: number): Wind {
  return seatAfter(state.turn, index + 1);
}

export function soloRiichiTiles(state: SoloState): Set<string> {
  const seat = state.seats[state.turn];
  if (state.phase !== 'discard' && state.phase !== 'riichi') return new Set();
  if (seat.riichi || !seat.drawn || !isMenzen(seat.furo) || seat.points < 1000 || state.wall.length < 4) return new Set();
  // Normal hands, seven pairs and kokushi share the same legal-discard check.
  const valid = new Set<string>();
  const all = [...seat.hand, seat.drawn];
  for (const tile of all) {
    if (soloWaits({ ...seat, hand: all.filter(t => t.id !== tile.id), drawn: null }).length) valid.add(tile.id);
  }
  return valid;
}

export function soloKanOptions(state: SoloState): NakiOption[] {
  if (state.phase !== 'discard' || !state.wall.length || state.doraCount >= 5) return [];
  const seat = state.seats[state.turn];
  if (!seat.drawn) return [];
  return [
    ...findLegalAnkanOptions(seat.hand, seat.drawn, seat.furo, seat.riichi),
    ...(!seat.riichi ? findKakanOptions(seat.hand, seat.drawn, seat.furo) : []),
  ];
}

function sameOption(a: NakiOption, b: NakiOption): boolean {
  return a.type === b.type && a.calledTile.id === b.calledTile.id &&
    a.tiles.length === b.tiles.length && a.tiles.every(t => b.tiles.some(u => t.id === u.id));
}

function forbiddenFor(option: NakiOption): string[] {
  const keys = [tileKey(option.calledTile)];
  if (option.type === 'chii') {
    const values = [...option.tiles, option.calledTile].map(t => t.value).sort((a, b) => a - b);
    const value = option.calledTile.value === values[0] ? values[2] + 1 :
      option.calledTile.value === values[2] ? values[0] - 1 : 0;
    if (value >= 1 && value <= 9) keys.push(`${option.calledTile.suit}-${value}`);
  }
  return keys;
}

export function currentSoloResponse(state: SoloState): Response | undefined {
  return state.pending?.responses.find(r => r.choice === undefined);
}

function offerResponses(state: SoloState, pending: PendingDiscard): SoloState {
  const context = { ...state, pending };
  const responses: Response[] = [];
  for (let i = 1; i <= 3; i++) {
    const wind = seatAfter(pending.source, i);
    const seat = state.seats[wind];
    const waits = soloWaits(seat);
    const furiten = seat.temporaryFuriten || seat.riichiFuriten || waits.some(t => seat.discards.some(d => sameTile(t, d)));
    const analysis = !furiten ? soloScore(context, wind, pending.tile, 'ron', pending.source) : null;
    const ron = !!analysis && (pending.kind !== 'ankan' || analysis.handInterpretations.some(h => h.yaku.some(y => y.name === 'kokushi-musou')));
    const options = pending.kind === 'discard' && !seat.riichi && state.wall.length > 0
      ? findNakiOptions(seat.hand, pending.tile).filter(option => {
        if (option.type === 'chii' && wind !== seatAfter(pending.source)) return false;
        if (option.type === 'daiminkan') return state.doraCount < 5;
        const removed = new Set(option.tiles.map(t => t.id));
        return seat.hand.some(t => !removed.has(t.id) && !forbiddenFor(option).includes(tileKey(t)));
      }) : [];
    if (ron || options.length) responses.push({ wind, ron, options });
  }
  const next = { ...state, pending: { ...pending, responses } };
  return responses.length ? { ...next, phase: 'response', view: responses[0].wind } : resolveResponses(next);
}

function completeKan(state: SoloState, wind: Wind, option: NakiOption): SoloState {
  const source = state.pending?.source;
  const tile = state.pending?.tile;
  const context = soloPerspective(state, wind);
  const changed = applyDeclareKan({ ...context,
    phase: option.type === 'daiminkan' ? 'naki' : 'playerDiscard',
    lastCpuDiscard: tile ?? null, lastDiscardWind: source,
  }, option);
  if (!changed) return state;
  const next = cancelIppatsu({ ...state, wall: changed.wall, wanpai: changed.wanpai,
    doraCount: changed.doraCount, pending: null, phase: 'discard', turn: wind, view: wind });
  return updateSeat(next, wind, { hand: changed.playerHand, drawn: changed.playerDrawnTile,
    furo: changed.playerFuro, rinshan: true, temporaryFuriten: false, forbiddenDiscards: [] });
}

function resolveResponses(state: SoloState): SoloState {
  const pending = state.pending!;
  const winners = pending.responses.filter(r => r.choice === 'ron').map(r => r.wind);
  if (winners.length) return win(state, winners, 'ron', pending.tile, pending.source);
  if (pending.kind !== 'discard') return completeKan(state, pending.source, pending.kan!);
  const calls = pending.responses.filter(r => typeof r.choice === 'object');
  // Stable seat order breaks equal-priority ties; ron was resolved first.
  calls.sort((a, b) => Number((a.choice as NakiOption).type === 'chii') - Number((b.choice as NakiOption).type === 'chii'));
  if (!calls.length) return drawFor({ ...state, pending: null }, seatAfter(pending.source));
  const caller = calls[0];
  const option = caller.choice as NakiOption;
  if (option.type === 'daiminkan') return completeKan(state, caller.wind, option);
  const seat = state.seats[caller.wind];
  const removed = new Set(option.tiles.map(t => t.id));
  const furo: Furo = { type: option.type, tiles: [...option.tiles, pending.tile], calledTile: pending.tile, fromWind: pending.source };
  return updateSeat(cancelIppatsu({ ...state, turn: caller.wind, view: caller.wind, phase: 'discard', pending: null }), caller.wind,
    { hand: sortHand(seat.hand.filter(t => !removed.has(t.id))), drawn: null,
      furo: [...seat.furo, furo], forbiddenDiscards: forbiddenFor(option) });
}

export function applySoloAction(state: SoloState, action: SoloAction): SoloState | null {
  if (state.phase === 'end') return null;
  if (action.type === 'respond') {
    if (state.phase !== 'response' || !state.pending) return null;
    const response = currentSoloResponse(state);
    if (!response || (action.choice === 'ron' && !response.ron)) return null;
    if (typeof action.choice === 'object' && !response.options.some(o => sameOption(o, action.choice as NakiOption))) return null;
    let next = state;
    if (response.ron && action.choice !== 'ron') {
      next = updateSeat(next, response.wind, { temporaryFuriten: true,
        riichiFuriten: state.seats[response.wind].riichi || state.seats[response.wind].riichiFuriten });
    }
    next = { ...next, pending: { ...state.pending,
      responses: state.pending.responses.map(r => r.wind === response.wind ? { ...r, choice: action.choice } : r) } };
    const following = currentSoloResponse(next);
    return following ? { ...next, view: following.wind } : resolveResponses(next);
  }
  if (state.phase === 'response') return null;
  const wind = state.turn;
  const seat = state.seats[wind];
  if (action.type === 'riichi') return state.phase === 'discard' && soloRiichiTiles(state).size ? { ...state, phase: 'riichi' } : null;
  if (action.type === 'cancelRiichi') return state.phase === 'riichi' ? { ...state, phase: 'discard' } : null;
  if (action.type === 'tsumo') {
    return state.phase === 'discard' && seat.drawn && soloScore(state, wind, seat.drawn, 'tsumo')
      ? win(state, [wind], 'tsumo', seat.drawn) : null;
  }
  if (action.type === 'kan') {
    if (!soloKanOptions(state).some(o => sameOption(o, action.option))) return null;
    const tile = action.option.type === 'ankan'
      ? action.option.tiles.find(t => t.id === seat.drawn?.id) ?? action.option.tiles[0]
      : action.option.tiles[0];
    return offerResponses(state, { kind: action.option.type === 'ankan' ? 'ankan' : 'kakan',
      source: wind, tile, kan: action.option, responses: [] });
  }
  if (action.type !== 'discard') return null;
  const tile = [...seat.hand, ...(seat.drawn ? [seat.drawn] : [])].find(t => t.id === action.tileId);
  if (!tile || seat.forbiddenDiscards.includes(tileKey(tile))) return null;
  if (seat.riichi && tile.id !== seat.drawn?.id) return null;
  const declaring = state.phase === 'riichi';
  if (declaring && !soloRiichiTiles(state).has(tile.id)) return null;
  const hand = sortHand([...seat.hand, ...(seat.drawn ? [seat.drawn] : [])].filter(t => t.id !== tile.id));
  const next = updateSeat({ ...state, lastDiscard: { wind, tile }, pot: state.pot + (declaring ? 1000 : 0) }, wind, {
    hand, drawn: null, discards: [...seat.discards, tile], forbiddenDiscards: [],
    points: seat.points - (declaring ? 1000 : 0), riichi: seat.riichi || declaring,
    doubleRiichi: seat.doubleRiichi || (declaring && !state.callsMade && seat.discards.length === 0),
    riichiDiscardId: declaring ? tile.id : seat.riichiDiscardId,
    ippatsu: declaring, rinshan: false,
  });
  return offerResponses(next, { kind: 'discard', source: wind, tile, responses: [], riichiDeposit: declaring });
}

export interface SoloHistory {
  entries: { state: SoloState; action?: SoloAction }[];
  index: number;
  pending: { state: SoloState; action: SoloAction } | { rewind: number } | null;
}

export type SoloHistoryEvent =
  | { type: 'act'; action: SoloAction }
  | { type: 'back' | 'forward' | 'first' | 'last' | 'confirm' | 'cancel' | 'matta' }
  | { type: 'restart'; state: SoloState };

export function soloHistoryReducer(history: SoloHistory, event: SoloHistoryEvent): SoloHistory {
  if (event.type === 'restart') return { entries: [{ state: event.state }], index: 0, pending: null };
  if (event.type === 'cancel') return { ...history, pending: null };
  if (event.type === 'confirm') {
    if (!history.pending) return history;
    if ('rewind' in history.pending) return {
      entries: history.entries.slice(0, history.pending.rewind + 1), index: history.pending.rewind, pending: null,
    };
    return { entries: [...history.entries.slice(0, history.index + 1), history.pending], index: history.index + 1, pending: null };
  }
  if (history.pending) return history;
  if (event.type === 'first') return { ...history, index: 0 };
  if (event.type === 'last') return { ...history, index: history.entries.length - 1 };
  if (event.type === 'back') return { ...history, index: Math.max(0, history.index - 1) };
  if (event.type === 'forward') return { ...history, index: Math.min(history.entries.length - 1, history.index + 1) };
  if (event.type === 'matta') {
    const index = Math.max(0, history.index - 1);
    if (history.index < history.entries.length - 1) return { ...history, pending: { rewind: index } };
    return { entries: history.entries.slice(0, index + 1), index, pending: null };
  }
  if (event.type !== 'act') return history;
  const state = applySoloAction(history.entries[history.index].state, event.action);
  if (!state) return history;
  if (history.index < history.entries.length - 1) {
    if (JSON.stringify(event.action) === JSON.stringify(history.entries[history.index + 1].action)) return { ...history, index: history.index + 1 };
    return { ...history, pending: { state, action: event.action } };
  }
  return { entries: [...history.entries, { state, action: event.action }], index: history.index + 1, pending: null };
}

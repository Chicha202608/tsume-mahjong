import { describe, expect, it } from 'vitest';
import type { Tile, Wind } from '@/types';
import { createDeck, getDoraTileKeys, nextDoraTile, findAnkanOptions } from '@/gameLogic';
import { makeInitialState, makeInitialStateBase, type State } from '@/game/gameState';
import { activeSeats, nextSeat, playerDrawOffset, isPlayerWallIndex, wallSeatAt } from '@/game/seatFlow';
import { applyCpuTurn, applyPassNaki, applyPlayerDraw, applyPlayerDiscard, applyCallNaki,
  applyPlayerNakiDiscard, applyNuki, findNukiOptions, applyDeclareKan, applyDeclareTsumo } from '@/game/transitions';
import { scoreHand } from '@/game/scoreAdapter';
import { buildNotenReplay, buildSolverReplay } from '@/game/solverReplay';
import { findBestNoKanSolution } from '@/game/drawSolution';
import { searchWithOpenCalls } from '@/game/openSearch';
import { findCandidateSolution } from '@/game/candidateSolution';
import { replayCandidateOpportunity } from '@/game/candidateReplay';

let serial = 0;
const tile = (suit: Tile['suit'], value: number): Tile => ({ suit, value, id: `three-${serial++}` });
const tiles = (suit: Tile['suit'], values: number[]) => values.map(value => tile(suit, value));
const tenpai = () => [...tiles('pin', [1,2,3,4,5,6]), ...tiles('sou', [6,7,8,2,3,5,5])];
const seats: Wind[] = ['east', 'south', 'west'];
function fixture(hand = tenpai(), wall = [tile('wind',4), tile('wind',1), tile('sou',1)], playerWind: Wind = 'east'): State {
  return { ...makeInitialStateBase(hand, [], wall, [], playerWind, playerWind === 'east' ? 'south' : 'east'),
    mode: 'three', roundWind: 'east', nextSeat: playerWind, phase: 'playerDraw', playerNuki: [],
    opponents: seats.filter(wind => wind !== playerWind).map(wind => ({ wind, hand: [], discards: [] })),
  };
}
function winning(seat: Wind = 'south'): State {
  const state = fixture(tenpai(), [tile('pin',1)], seat);
  const winTile = tile('sou',1);
  return { ...state, phase: 'win', winType: 'tsumo', winTile, playerDrawnTile: winTile,
    playerNuki: tiles('wind', [4,4,4]) };
}

describe('three-player deck and turn flow', () => {
  it('deals 108 distinct tiles, two concealed opponents, 14 dead-wall tiles and 55 live tiles', () => {
    const state = makeInitialState('three');
    const all = [...state.playerHand, ...state.opponents!.flatMap(p => p.hand), ...state.wanpai, ...state.wall];
    expect(state.opponents).toHaveLength(2);
    expect(state.opponents!.every(p => p.hand.length === 13)).toBe(true);
    expect(state.wanpai).toHaveLength(14);
    expect(state.wall).toHaveLength(55);
    expect(all).toHaveLength(108);
    expect(new Set(all.map(t => t.id)).size).toBe(108);
    expect(all.filter(t => t.suit === 'man').map(t => t.value).sort()).toEqual([1,1,1,1,9,9,9,9]);
    expect(all.filter(t => t.suit === 'wind' && t.value === 4)).toHaveLength(4);
    expect(all.filter(t => t.isRed)).toHaveLength(2);
    expect(state.playerWind).not.toBe('north');
    expect(state.nextSeat).toBe('east');
    expect(createDeck()).toHaveLength(136);
  });

  it.each(seats)('consumes the correct lane and exhausts the full wall from %s', playerWind => {
    const state = { ...makeInitialState('three'), playerWind, nextSeat: 'east' as const,
      phase: playerWind === 'east' ? 'playerDraw' as const : 'cpuTurn' as const,
      opponents: seats.filter(wind => wind !== playerWind).map(wind => ({ wind, hand: [], discards: [] })),
    };
    expect(activeSeats(state)).toEqual(seats);
    expect(playerDrawOffset(state)).toBe(seats.indexOf(playerWind));
    expect(nextSeat(state, 'west')).toBe('east');
    expect(nextSeat(state, 'east', -1)).toBe('west');
    const frames = buildNotenReplay(state);
    const last = frames[frames.length - 1].state;
    expect(last.phase).toBe('exhausted');
    expect(last.wallDrawnCount).toBe(55);
    expect(last.playerDiscards).toEqual(state.wall.filter((_, i) => seats[i % 3] === playerWind));
    for (const opponent of last.opponents!) {
      expect(opponent.discards).toEqual(state.wall.filter((_, i) => seats[i % 3] === opponent.wind));
    }
    state.wall.forEach((_, i) => {
      expect(wallSeatAt(state, i)).toBe(seats[i % 3]);
      expect(isPlayerWallIndex(state, i)).toBe(seats[i % 3] === playerWind);
    });
  });

  it.each(['south','west'] as const)('forbids chi, permits pon from %s and resumes at south', from => {
    const state = fixture([...tiles('pin',[1,2,3,3]), ...tiles('sou',[1,1,1,5,5,5,8,8,8])],
      [tile('pin',3),tile('wind',1),tile('wind',2),tile('wind',3)]);
    state.nextSeat = from; state.phase = 'cpuTurn';
    const offer = applyCpuTurn(state)!;
    expect(offer.nakiOptions.some(o => o.type === 'chii')).toBe(false);
    expect(applyCallNaki(offer, { type: 'chii', tiles: state.playerHand.slice(0,2), calledTile: offer.lastCpuDiscard! })).toBeNull();
    const pon = offer.nakiOptions.find(o => o.type === 'pung')!;
    const called = applyCallNaki(offer, pon)!;
    expect(called.playerFuro[0].fromWind).toBe(from);
    expect(called.nextSeat).toBe('south');
    expect(applyPlayerNakiDiscard(called, called.playerHand[0])!.phase).toBe('cpuTurn');
  });

  it('carries temporary furiten across both opponents until the next player draw', () => {
    let state = fixture(tenpai(), [tile('sou',1),tile('sou',1),tile('wind',1)]);
    state.nextSeat = 'south'; state.phase = 'cpuTurn';
    const first = applyCpuTurn(state)!;
    expect(first.ronAvailable).toBe(true);
    state = applyPassNaki(first)!;
    expect(state.phase).toBe('cpuTurn');
    expect(state.temporaryFuriten).toBe(true);
    state = applyCpuTurn(state)!;
    expect(state.ronAvailable).toBe(false);
    if (state.phase === 'naki') state = applyPassNaki(state)!;
    state = applyPlayerDraw(state)!;
    expect(state.temporaryFuriten).toBe(false);
  });
});

describe('north extraction', () => {
  it('draws from the tail, keeps the closed hand, dora and turn order, and clears ippatsu', () => {
    const initial = fixture();
    const drawn = { ...applyPlayerDraw(initial)!, isIppatsu: true };
    const north = drawn.playerDrawnTile!;
    const next = applyNuki(drawn, north)!;
    expect(next.playerHand.map(t => t.id).sort()).toEqual(initial.playerHand.map(t => t.id).sort());
    expect(next.playerDrawnTile).toEqual(initial.wall[2]);
    expect(next.wall).toEqual(initial.wall.slice(1,2));
    expect(next.playerNuki).toEqual([north]);
    expect(next.playerFuro).toHaveLength(0);
    expect(next.doraCount).toBe(drawn.doraCount);
    expect(next.wanpai).toEqual(drawn.wanpai);
    expect(next.nextSeat).toBe(drawn.nextSeat);
    expect(next.wallDrawnCount).toBe(1);
    expect(next.isIppatsu).toBe(false);
    expect(next.drawnFromRinshan).toBe(false);
    expect(next.drawnFromNuki).toBe(true);
    expect(next.tsumoAvailable).toBe(true);
    expect(drawn.playerNuki).toHaveLength(0);
  });

  it('can extract a held north while retaining the original drawn tile', () => {
    const hand = tenpai(); hand[0] = tile('wind',4);
    const initial = fixture(hand, [tile('pin',1),tile('wind',1),tile('sou',1)]);
    const drawn = applyPlayerDraw(initial)!;
    const next = applyNuki(drawn, hand[0])!;
    expect(next.playerHand.map(t => t.id)).toContain(drawn.playerDrawnTile!.id);
    expect(next.playerHand).toHaveLength(13);
    expect(next.playerHand.map(t => t.id)).not.toContain(hand[0].id);
  });

  it('permits repeated extraction and never counts it as a kan', () => {
    const initial = fixture(tenpai(), [tile('wind',4),tile('wind',1),tile('sou',1),tile('wind',4)]);
    const once = applyNuki(applyPlayerDraw(initial)!, initial.wall[0])!;
    const twice = applyNuki(once, once.playerDrawnTile!)!;
    expect(twice.playerNuki).toHaveLength(2);
    expect(twice.playerDrawnTile).toEqual(initial.wall[2]);
    expect(twice.doraCount).toBe(1);
    expect(twice.wall).toEqual([initial.wall[1]]);
  });

  it('allows only the drawn north after riichi and blocks invalid actions', () => {
    const initial = fixture();
    const drawn = applyPlayerDraw(initial)!;
    const riichi = { ...drawn, isRiichi: true };
    expect(findNukiOptions(riichi)).toEqual([drawn.playerDrawnTile]);
    expect(applyNuki(riichi, drawn.playerDrawnTile!)).not.toBeNull();
    const heldNorth = tile('wind',4);
    expect(applyNuki({ ...riichi, playerDrawnTile: tile('pin',1), playerHand: [...riichi.playerHand.slice(1),heldNorth] }, heldNorth)).toBeNull();
    expect(applyNuki({ ...drawn, wall: [] }, drawn.playerDrawnTile!)).toBeNull();
    expect(applyNuki({ ...drawn, mode: 'four' }, drawn.playerDrawnTile!)).toBeNull();
    expect(applyNuki(initial, initial.wall[0])).toBeNull();
    expect(applyNuki(drawn, tile('wind',4))).toBeNull();
  });

  it('allows discarding north instead of extracting it and ends normally at the wall boundary', () => {
    const initial = fixture(tenpai(), [tile('wind',4),tile('sou',1)]);
    const drawn = applyPlayerDraw(initial)!;
    expect(applyPlayerDiscard(drawn, drawn.playerDrawnTile!)!.playerDiscards).toEqual([initial.wall[0]]);
    const extracted = applyNuki(drawn, drawn.playerDrawnTile!)!;
    expect(extracted.wall).toHaveLength(0);
    expect(findNukiOptions(extracted)).toHaveLength(0);
    expect(applyPlayerDiscard(extracted, extracted.playerDrawnTile!)!.phase).toBe('exhausted');
  });

  it('shares the tail correctly with a subsequent kan and preserves physical tile IDs', () => {
    const hand = [...tiles('pin',[1,1,1,1,4,5,6]), ...tiles('sou',[1,2,3,7,8,9])];
    const state = fixture(hand, [tile('wind',4),tile('wind',1),tile('wind',2),tile('sou',5),tile('sou',6)]);
    state.wanpai = [...tiles('wind',[3,3,3,3]), ...tiles('dragon',[1,1,1,1,2,2,2,2,3,3])];
    const drawn = applyPlayerDraw(state)!;
    const extracted = applyNuki(drawn, drawn.playerDrawnTile!)!;
    const kan = findAnkanOptions(extracted.playerHand, extracted.playerDrawnTile)[0];
    const after = applyDeclareKan(extracted, kan)!;
    expect(after.wall).toEqual(state.wall.slice(1,-2));
    expect(after.wanpai.slice(0,4)).toContain(state.wall[state.wall.length - 2]);
    expect(after.playerNuki).toHaveLength(1);
    expect(after.drawnFromNuki).toBe(false);
    const all = [...after.playerHand, after.playerDrawnTile!, ...after.playerFuro.flatMap(f => f.tiles),
      ...after.playerNuki!, ...after.wall, ...after.wanpai];
    const before = [...state.playerHand, ...state.wall, ...state.wanpai];
    expect(all.map(t => t.id).sort()).toEqual(before.map(t => t.id).sort());
  });
});

describe('three-player scoring', () => {
  it.each([['south',6000],['west',6000],['east',8000]] as const)('uses tsumo-loss mangan for %s', (wind, points) => {
    const best = scoreHand(winning(wind))!.handInterpretations[0];
    expect(best.han).toBe(5);
    expect(best.basicPoints).toBe(2000);
    expect(best.nukiDora).toBe(3);
    expect(best.totalWinnings).toBe(points);
    expect(best.seatPayments).toHaveLength(2);
    expect(best.seatPayments.some(p => p.seat === 'north')).toBe(false);
  });

  it.each([['south',8000],['east',12000]] as const)('keeps the normal mangan ron payment for %s', (wind, points) => {
    const state = winning(wind);
    state.winType = 'ron'; state.winFromWind = wind === 'east' ? 'west' : 'east';
    state.isRiichi = true; state.playerNuki = tiles('wind',[4,4,4]);
    const best = scoreHand(state)!.handInterpretations[0];
    expect(best.totalWinnings).toBe(points);
    expect(best.seatPayments).toEqual([{ seat: state.winFromWind, value: points }]);
  });

  it('rounds each low-score payment separately', () => {
    const state = winning(); state.playerNuki = [];
    const best = scoreHand(state)!.handInterpretations[0];
    expect(best.han).toBe(2); expect(best.fu).toBe(20);
    expect(best.seatPayments).toEqual([{seat:'east',value:700},{seat:'west',value:400}]);
    expect(best.totalWinnings).toBe(1100);
  });

  it('cycles 1m to 9m in visual dora and scoring, including duplicate indicators', () => {
    expect(nextDoraTile(tile('man',1), 'three').value).toBe(9);
    expect(nextDoraTile(tile('man',9), 'three').value).toBe(1);
    const state = winning();
    state.playerHand = [...tiles('man',[9,9,9]), ...tiles('pin',[1,2,3,4,5,6]), ...tiles('sou',[2,3,5,5])];
    state.playerNuki = []; state.doraCount = 2;
    state.wanpai = Array.from({length:14}, () => tile('dragon',1));
    state.wanpai[4] = tile('man',1); state.wanpai[5] = tile('man',1);
    expect(getDoraTileKeys(state.wanpai, 2, 'three').has('man-9')).toBe(true);
    const best = scoreHand(state)!.handInterpretations[0];
    expect(best.dora).toBe(6);
    expect(best.han).toBe(7);
    expect(best.totalWinnings).toBe(9000);
  });

  it('counts north-indicator bonuses on extracted north separately from a hand north', () => {
    const state = winning(); state.playerNuki = tiles('wind',[4,4]);
    state.wanpai = Array.from({length:14}, () => tile('dragon',1));
    state.wanpai[4] = tile('wind',3);
    const best = scoreHand(state)!.handInterpretations[0];
    expect(best.nukiDora).toBe(4); expect(best.dora).toBe(0);
    expect(best.han).toBe(6);
  });

  it('does not award rinshan or haitei on the final north replacement', () => {
    const initial = fixture(tenpai(), [tile('wind',4),tile('sou',1)]);
    initial.fullWall = Array.from({length:55}, () => tile('pin',9));
    const drawn = applyPlayerDraw(initial)!;
    const extracted = applyNuki(drawn, drawn.playerDrawnTile!)!;
    const win = applyDeclareTsumo(extracted)!;
    const yaku = scoreHand(win)!.handInterpretations[0].yaku.map(y => y.name);
    expect(yaku).toContain('menzen-tsumo');
    expect(yaku).not.toContain('rinshan-kaihou'); expect(yaku).not.toContain('haitei');
  });

  it('does not turn a yakuless ron into a win using extracted north', () => {
    const state = winning(); state.winType = 'ron'; state.winFromWind = 'east';
    state.playerHand = [...tiles('pin',[1,2,3,4,5,6]), ...tiles('sou',[6,7,8,2,3]), ...tiles('dragon',[1,1])];
    state.winTile = tile('sou',4); // dragon pair removes pinfu; no other ron yaku.
    const result = scoreHand(state)!;
    expect(result.valid).toBe(false);
    expect(result.handInterpretations).toHaveLength(0);
  });
});

describe('three-player AI and replay', () => {
  it('permits late riichi on the eighteenth discard when a nineteenth own draw remains', () => {
    const state = fixture(tenpai(), [...tiles('wind',Array(54).fill(4)),tile('sou',1)]);
    const counts = Array<number>(34).fill(0);
    for (const t of state.playerHand) counts[(t.suit === 'pin' ? 9 : 18) + t.value - 1]++;
    const candidate = replayCandidateOpportunity(state, { type: 'tsumo', wallIndex: 54, winningFace: 18,
      candidate: { counts, earliestPlayerDraw: 0, waits: [18,21] } });
    expect(candidate?.riichi).toBe(true);
    expect(candidate?.discards).toHaveLength(18);
  });

  it('finds wins from all three draw offsets and preserves ron sources', () => {
    for (const next of seats) {
      const state = fixture(); state.wall = [tile('sou',1),tile('wind',1),tile('wind',2),tile('wind',3)];
      state.fullWall = [...state.wall]; state.nextSeat = next;
      state.phase = next === 'east' ? 'playerDraw' : 'cpuTurn';
      const result = findCandidateSolution(state)!;
      expect(result?.outcome).toBe('win');
      const frames = buildSolverReplay(state, result);
      expect(frames).toHaveLength(result.line.length + 1);
      const win = frames[frames.length - 1].state;
      expect(win.phase).toBe('win');
      expect(scoreHand(win)!.handInterpretations[0].totalWinnings).toBe(result.bestScore);
      if (next !== 'east') expect(win.winFromWind).toBe(next);
    }
  });

  it.each([false,true])('finds and exactly replays a north replacement win (chained=%s)', chained => {
    const state = fixture(tenpai(), chained
      ? [tile('wind',4),tile('wind',1),tile('sou',1),tile('wind',4)] : undefined);
    state.playerDiscards = [tile('sou',1)]; // A replacement tsumo can overcome permanent ron furiten.
    state.playerNuki = [tile('wind',4)];
    const baseline = findBestNoKanSolution(state);
    const result = searchWithOpenCalls(state, baseline, 2000)!;
    expect(result?.outcome).toBe('win');
    expect(result.line.filter(a => a.type === 'nuki')).toHaveLength(chained ? 2 : 1);
    expect(result.line.some(a => a.type === 'call-naki' && a.option.type === 'chii')).toBe(false);
    const frames = buildSolverReplay(state, result);
    expect(frames).toHaveLength(result.line.length + 1);
    const win = frames[frames.length - 1].state;
    expect(win.phase).toBe('win');
    expect(win.playerNuki).toHaveLength(chained ? 3 : 2);
    expect(scoreHand(win)!.handInterpretations[0].totalWinnings).toBe(result.bestScore);
    expect(result.bestScore).toBeGreaterThan(baseline?.bestScore ?? 0);
    expect(state.playerNuki).toHaveLength(1);
  });

  it('combines north extraction with concealed kan and replays both tail consumptions', () => {
    const hand = [...tiles('pin',[1,1,1,1,5,5,5]), ...tiles('sou',[7,7,7]), ...tiles('dragon',[1,1]),tile('wind',4)];
    const state = fixture(hand, [tile('dragon',1),tile('wind',1),tile('wind',2),tile('wind',3),tile('sou',5)]);
    state.wanpai = [tile('sou',5), ...tiles('wind',[2,2,2]), ...tiles('dragon',[2,2,2,2,3,3,3,3]), ...tiles('man',[9,9])];
    const result = searchWithOpenCalls(state, null, 2000)!;
    expect(result?.outcome).toBe('win');
    expect(result.line.some(a => a.type === 'nuki')).toBe(true);
    expect(result.line.some(a => a.type === 'ankan')).toBe(true);
    const frames = buildSolverReplay(state, result);
    expect(frames).toHaveLength(result.line.length + 1);
    const win = frames[frames.length - 1].state;
    expect(win.playerFuro).toHaveLength(1);
    expect(win.playerNuki).toHaveLength(1);
    expect(scoreHand(win)!.handInterpretations[0].totalWinnings).toBe(result.bestScore);
    expect(win.wall).toEqual(state.wall.slice(1,-2));
  });
});

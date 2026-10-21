import { describe, expect, it } from 'vitest';
import type { Tile, Wind } from '@/types';
import { createDeck, tileKey } from '@/gameLogic';
import { SEATS, seatAfter } from '@/game/seatFlow';
import {
  applySoloAction, createSoloState, currentSoloResponse, soloHistoryReducer,
  soloKanOptions, soloRiichiTiles, soloScore, soloWaits, soloWallSeat,
  type SoloHistory, type SoloState,
} from '@/game/soloFour';

let serial = 1000;
function tiles(text: string): Tile[] {
  return [...text.matchAll(/([1-9]+)([mpsz])/g)].flatMap(([, values, suit]) => [...values].map(value => ({
    id: `fixture-${serial++}`, suit: suit === 'm' ? 'man' : suit === 'p' ? 'pin' : suit === 's' ? 'sou' : +value <= 4 ? 'wind' : 'dragon',
    value: suit === 'z' && +value > 4 ? +value - 4 : +value,
  } as Tile)));
}

function fixture(hands: Partial<Record<Wind, string>> = {}): SoloState {
  const state = createSoloState();
  state.callsMade = true; // Fixture wins should not acquire tenhou/chiihou.
  for (const wind of SEATS) {
    state.seats[wind] = { ...state.seats[wind], hand: tiles(hands[wind] ?? '147m147p147s1234z'), drawn: null };
  }
  state.seats.east.drawn = tiles('5z')[0];
  state.wall = tiles('123456789m123456789p123456789s');
  state.fullWall = [...state.wall];
  state.wanpai = tiles('123456789m12345p');
  return state;
}

function discard(state: SoloState, tile = state.seats[state.turn].drawn!): SoloState {
  const next = applySoloAction(state, { type: 'discard', tileId: tile.id });
  expect(next).not.toBeNull();
  return next!;
}

function passAll(state: SoloState): SoloState {
  let next = state;
  while (next.phase === 'response') next = applySoloAction(next, { type: 'respond', choice: 'pass' })!;
  return next;
}

function physicalIds(state: SoloState): string[] {
  const called = new Set(SEATS.flatMap(w => state.seats[w].furo.filter(f => f.type !== 'ankan').map(f => f.calledTile.id)));
  return [...state.wall, ...state.wanpai, ...SEATS.flatMap(w => {
    const seat = state.seats[w];
    return [...seat.hand, ...(seat.drawn ? [seat.drawn] : []), ...seat.furo.flatMap(f => f.tiles), ...seat.discards.filter(t => !called.has(t.id))];
  })].map(t => t.id).sort();
}

describe('solo four-seat turn flow and public wall ownership', () => {
  it('deals 136 unique tiles, starts with east drawn, and rotates all four seats', () => {
    let state = createSoloState();
    expect(state.wall).toHaveLength(69);
    expect(state.wanpai).toHaveLength(14);
    expect(state.turn).toBe('east');
    const ids = physicalIds(state);
    expect(ids).toHaveLength(136);
    expect(new Set(ids).size).toBe(136);
    for (const wind of SEATS) {
      expect(state.turn).toBe(wind);
      expect(state.view).toBe(wind);
      expect(soloWallSeat(state, 0)).toBe(seatAfter(wind));
      expect(soloWallSeat(state, 3)).toBe(wind);
      state = passAll(discard(state));
      expect(physicalIds(state)).toEqual(ids);
    }
    expect(state.turn).toBe('east');
  });

  it('plays an entire deterministic hand without losing or duplicating tiles', () => {
    let state = createSoloState(createDeck());
    const ids = physicalIds(state);
    let decisions = 0;
    while (state.phase !== 'end' && decisions++ < 300) {
      state = state.phase === 'response'
        ? applySoloAction(state, { type: 'respond', choice: 'pass' })!
        : discard(state);
      expect(physicalIds(state)).toEqual(ids);
    }
    expect(state.phase).toBe('end');
    expect(state.result?.type).toBe('draw');
    expect(state.wall).toHaveLength(0);
    expect(SEATS.reduce((sum, w) => sum + state.seats[w].points, state.pot)).toBe(100000);
  });

  it('rejects stale tile clicks and invalid action phases', () => {
    const state = fixture();
    const tile = state.seats.east.drawn!;
    const next = passAll(discard(state, tile));
    expect(applySoloAction(next, { type: 'discard', tileId: tile.id })).toBeNull();
    expect(applySoloAction(next, { type: 'respond', choice: 'pass' })).toBeNull();
    expect(applySoloAction(state, { type: 'kan', option: { type: 'ankan', tiles: [tile], calledTile: tile } })).toBeNull();
  });
});

describe('response arbitration', () => {
  it('collects the chi and pon choices before applying pon, then resumes after the caller', () => {
    const state = fixture({ south: '46m147p147s12345z', west: '55m147p147s12345z' });
    state.seats.east.drawn = tiles('5m')[0];
    let next = discard(state);
    expect(next.phase).toBe('response');
    expect(next.turn).toBe('east');
    expect(next.view).toBe('south');
    const chi = currentSoloResponse(next)!.options.find(o => o.type === 'chii')!;
    expect(soloWallSeat(next, 0)).toBe('south');
    next = applySoloAction(next, { type: 'respond', choice: chi })!;
    expect(next.view).toBe('west');
    expect(next.seats.south.furo).toHaveLength(0);
    expect(soloWallSeat(next, 0)).toBe('south'); // View changes do not change the actual draw order.
    const pon = currentSoloResponse(next)!.options.find(o => o.type === 'pung')!;
    next = applySoloAction(next, { type: 'respond', choice: pon })!;
    expect(next.turn).toBe('west');
    expect(next.view).toBe('west');
    expect(next.seats.west.drawn).toBeNull();
    expect(next.seats.west.furo[0].fromWind).toBe('east');
    expect(next.seats.south.furo).toHaveLength(0);
    expect(soloWallSeat(next, 0)).toBe('north');
    const allowed = next.seats.west.hand.find(t => !next.seats.west.forbiddenDiscards.includes(tileKey(t)))!;
    next = passAll(discard(next, allowed));
    expect(next.turn).toBe('north');
  });

  it('allows chi only from the preceding seat and prevents kuikae', () => {
    const state = fixture({ south: '456m147p147s1234z', west: '46m147p147s12345z' });
    state.seats.east.drawn = tiles('3m')[0];
    const next = discard(state);
    expect(next.pending?.responses.every(r => r.wind === 'south' || r.options.every(o => o.type !== 'chii'))).toBe(true);
    const chi = currentSoloResponse(next)!.options.find(o => o.type === 'chii')!;
    const called = applySoloAction(next, { type: 'respond', choice: chi })!;
    expect(called.turn).toBe('south');
    expect(called.seats.south.forbiddenDiscards).toContain('man-6');
    const six = called.seats.south.hand.find(t => t.suit === 'man' && t.value === 6)!;
    expect(applySoloAction(called, { type: 'discard', tileId: six.id })).toBeNull();
  });

  it('supports multiple ron and gives deposits to the nearest winner', () => {
    const state = fixture({ south: '123m123p123s789s5z', west: '123m123p123s789s5z' });
    state.pot = 2000;
    state.seats.east.points -= 2000;
    let next = discard(state);
    expect(currentSoloResponse(next)?.ron).toBe(true);
    next = applySoloAction(next, { type: 'respond', choice: 'ron' })!;
    expect(next.phase).toBe('response');
    expect(next.seats.south.points).toBe(25000);
    next = applySoloAction(next, { type: 'respond', choice: 'ron' })!;
    expect(next.result?.winners.map(w => w.wind)).toEqual(['south', 'west']);
    expect(next.result!.delta.south - next.result!.delta.west).toBe(2000);
    expect(next.pot).toBe(0);
    expect(SEATS.reduce((sum, w) => sum + next.seats[w].points, 0)).toBe(100000);
  });

  it('prioritizes ron over a previously selected pon', () => {
    const state = fixture({ south: '55z147m147p147s12z', west: '123m123p123s789s5z' });
    let next = discard(state);
    const pon = currentSoloResponse(next)!.options.find(o => o.type === 'pung')!;
    next = applySoloAction(next, { type: 'respond', choice: pon })!;
    next = applySoloAction(next, { type: 'respond', choice: 'ron' })!;
    expect(next.result?.winners.map(w => w.wind)).toEqual(['west']);
    expect(next.seats.south.furo).toHaveLength(0);
  });

  it('keeps furiten separate for each seat and clears temporary furiten on that seat draw', () => {
    const state = fixture({ south: '123m123p123s789s5z', west: '123m123p123s789s5z' });
    let next = discard(state);
    next = applySoloAction(next, { type: 'respond', choice: 'pass' })!;
    expect(next.seats.south.temporaryFuriten).toBe(true);
    expect(next.seats.west.temporaryFuriten).toBe(false);
    next = applySoloAction(next, { type: 'respond', choice: 'pass' })!;
    expect(next.turn).toBe('south');
    expect(next.seats.south.temporaryFuriten).toBe(false);
    expect(next.seats.west.temporaryFuriten).toBe(true);
  });

  it('offers ron on the very last discard before exhaustive draw', () => {
    const state = fixture({ south: '123m123p123s789s5z' });
    state.wall = [];
    const offered = discard(state);
    expect(offered.phase).toBe('response');
    expect(currentSoloResponse(offered)?.ron).toBe(true);
    const ron = applySoloAction(offered, { type: 'respond', choice: 'ron' })!;
    expect(ron.result?.type).toBe('ron');
    const draw = passAll(offered);
    expect(draw.result?.type).toBe('draw');
  });
});

describe('riichi, kan, and scoring', () => {
  it('recognizes kokushi waits and riichi, without treating a quad as two pairs', () => {
    const state = fixture({ east: '19m19p19s1234567z' });
    expect(soloWaits(state.seats.east)).toHaveLength(13);
    state.seats.east.drawn = tiles('2m')[0];
    expect(soloRiichiTiles(state).has(state.seats.east.drawn.id)).toBe(true);
    const invalid = fixture({ east: '1111m223344p556s' });
    expect(soloWaits(invalid.seats.east).some(t => t.suit === 'sou' && t.value === 6)).toBe(false);
  });

  it('charges riichi once, restricts subsequent discards, and preserves the deposit total', () => {
    let state = fixture({ east: '123m123p123s789s5z' });
    state.seats.east.drawn = tiles('9m')[0];
    state = applySoloAction(state, { type: 'riichi' })!;
    expect(state.phase).toBe('riichi');
    const next = passAll(discard(state));
    expect(next.seats.east.riichi).toBe(true);
    expect(next.seats.east.points).toBe(24000);
    expect(next.pot).toBe(1000);
    expect(SEATS.reduce((sum, w) => sum + next.seats[w].points, next.pot)).toBe(100000);
    const eastTurn = { ...next, turn: 'east' as const, view: 'east' as const };
    eastTurn.seats.east = { ...eastTurn.seats.east, drawn: tiles('8m')[0] };
    expect(applySoloAction(eastTurn, { type: 'discard', tileId: eastTurn.seats.east.hand[0].id })).toBeNull();
  });

  it('rejects riichi without enough points or another normal draw', () => {
    const state = fixture({ east: '123m123p123s789s5z' });
    state.seats.east.points = 900;
    expect(soloRiichiTiles(state).size).toBe(0);
    state.seats.east.points = 25000;
    state.wall = tiles('123m');
    expect(applySoloAction(state, { type: 'riichi' })).toBeNull();
  });

  it('moves the wall tail into the dead wall, draws rinshan, and cancels every ippatsu', () => {
    const state = fixture({ east: '111m234p345s678s5p' });
    state.seats.east.drawn = tiles('1m')[0];
    for (const w of SEATS) state.seats[w].ippatsu = true;
    const before = physicalIds(state);
    const wallTail = state.wall[state.wall.length - 1];
    const rinshan = state.wanpai[0];
    const option = soloKanOptions(state).find(o => o.type === 'ankan')!;
    const next = applySoloAction(state, { type: 'kan', option })!;
    expect(next.phase).toBe('discard');
    expect(next.seats.east.drawn).toEqual(rinshan);
    expect(next.seats.east.rinshan).toBe(true);
    expect(next.wanpai.some(t => t.id === wallTail.id)).toBe(true);
    expect(next.wall).toHaveLength(state.wall.length - 1);
    expect(next.doraCount).toBe(2);
    expect(SEATS.every(w => !next.seats[w].ippatsu)).toBe(true);
    expect(physicalIds(next)).toEqual(before);
  });

  it('offers chankan before completing kakan and leaves the old pon intact on ron', () => {
    const state = fixture({ east: '147m147p147s1z', south: '123m123p123s789s5z' });
    const pung = tiles('555z');
    state.seats.east.furo = [{ type: 'pung', tiles: pung, calledTile: pung[0], fromWind: 'north' }];
    state.seats.east.drawn = tiles('5z')[0];
    const option = soloKanOptions(state).find(o => o.type === 'kakan')!;
    const offered = applySoloAction(state, { type: 'kan', option })!;
    expect(offered.phase).toBe('response');
    expect(offered.doraCount).toBe(1);
    const next = applySoloAction(offered, { type: 'respond', choice: 'ron' })!;
    expect(next.result?.type).toBe('ron');
    expect(next.seats.east.furo[0].type).toBe('pung');
    expect(next.result!.winners[0].analysis.handInterpretations[0].yaku.some(y => y.name === 'chankan')).toBe(true);
  });

  it('completes a big open kan without consuming a normal draw for the caller', () => {
    const state = fixture({ south: '555m147p147s1234z' });
    state.seats.east.drawn = tiles('5m')[0];
    const before = physicalIds(state);
    let next = discard(state);
    const option = currentSoloResponse(next)!.options.find(o => o.type === 'daiminkan')!;
    next = applySoloAction(next, { type: 'respond', choice: option })!;
    expect(next.turn).toBe('south');
    expect(next.seats.south.furo[0].type).toBe('daiminkan');
    expect(next.seats.south.furo[0].fromWind).toBe('east');
    expect(next.seats.south.drawn).toEqual(state.wanpai[0]);
    expect(next.wall[0]).toEqual(state.wall[0]);
    expect(soloWallSeat(next, 0)).toBe('west');
    expect(physicalIds(next)).toEqual(before);
  });

  it('allows only kokushi to rob a concealed kan', () => {
    const state = fixture({ east: '111m147p147s1234z', south: '19m19p19s1234567z' });
    state.seats.east.drawn = tiles('1m')[0];
    const option = soloKanOptions(state).find(o => o.type === 'ankan')!;
    const offered = applySoloAction(state, { type: 'kan', option })!;
    expect(offered.phase).toBe('response');
    expect(currentSoloResponse(offered)?.wind).toBe('south');
    const next = applySoloAction(offered, { type: 'respond', choice: 'ron' })!;
    expect(next.result!.winners[0].analysis.handInterpretations[0].yaku.some(y => y.name === 'kokushi-musou')).toBe(true);
    expect(next.seats.east.furo).toHaveLength(0);
    expect(next.wall).toEqual(state.wall);
  });

  it('refunds a declaration deposit when the declaration tile is ronned', () => {
    let state = fixture({ east: '123m123p123s789s1z', south: '123m123p123s789s5z' });
    const drawn = state.seats.east.drawn!;
    state = applySoloAction(state, { type: 'riichi' })!;
    const offered = discard(state, drawn);
    expect(offered.pot).toBe(1000);
    const next = applySoloAction(offered, { type: 'respond', choice: 'ron' })!;
    expect(next.pot).toBe(0);
    expect(next.seats.east.riichi).toBe(false);
    expect(next.seats.east.points).toBe(25000 + next.result!.delta.east);
    expect(SEATS.reduce((sum, w) => sum + next.seats[w].points, 0)).toBe(100000);
  });

  it.each([0, 1, 2, 3, 4])('settles exhaustive draw correctly with %i tenpai seats', count => {
    const hands = Object.fromEntries(SEATS.slice(0, count).map(w => [w, '123m123p123s789s1z']));
    const state = fixture(hands);
    state.wall = [];
    const next = passAll(discard(state));
    expect(next.result!.tenpai).toHaveLength(count);
    for (const [i, wind] of SEATS.entries()) {
      const expected = count === 0 || count === 4 ? 0 : i < count ? 3000 / count : -3000 / (4 - count);
      expect(next.result!.delta[wind]).toBe(expected);
    }
  });

  it('pays a non-dealer tsumo from all three actual seats', () => {
    const state = fixture({ south: '123m123p123s789s5z' });
    state.turn = state.view = 'south';
    state.seats.east.drawn = null;
    state.seats.south.drawn = tiles('5z')[0];
    expect(soloScore(state, 'south', state.seats.south.drawn, 'tsumo')).not.toBeNull();
    const next = applySoloAction(state, { type: 'tsumo' })!;
    expect(next.result?.type).toBe('tsumo');
    expect(next.result!.delta.east).toBeLessThan(next.result!.delta.west);
    expect(next.result!.delta.west).toBe(next.result!.delta.north);
    expect(SEATS.reduce((sum, w) => sum + next.result!.delta[w], 0)).toBe(0);
  });
});

describe('decision history', () => {
  it('restores the exact state, view and wall highlight without generating moves', () => {
    const initial = fixture();
    let history: SoloHistory = { entries: [{ state: initial }], index: 0, pending: null };
    history = soloHistoryReducer(history, { type: 'act', action: { type: 'discard', tileId: initial.seats.east.drawn!.id } });
    const recorded = history.entries[1].state;
    expect(recorded.turn).toBe('south');
    history = soloHistoryReducer(history, { type: 'back' });
    expect(history.entries[history.index].state).toBe(initial);
    expect(history.entries[history.index].state.view).toBe('east');
    history = soloHistoryReducer(history, { type: 'forward' });
    expect(history.entries[history.index].state).toBe(recorded);
    const end = soloHistoryReducer(history, { type: 'forward' });
    expect(end.entries).toBe(history.entries);
    expect(end.index).toBe(1);
  });

  it('records every response and confirms branching before deleting future entries', () => {
    const state = fixture({ south: '46m147p147s12345z', west: '55m147p147s12345z' });
    state.seats.east.drawn = tiles('5m')[0];
    let history: SoloHistory = { entries: [{ state }], index: 0, pending: null };
    history = soloHistoryReducer(history, { type: 'act', action: { type: 'discard', tileId: state.seats.east.drawn.id } });
    const offered = history.entries[1].state;
    expect(offered.view).toBe('south');
    history = soloHistoryReducer(history, { type: 'act', action: { type: 'respond', choice: 'pass' } });
    expect(history.entries[2].state.view).toBe('west');
    history = soloHistoryReducer(history, { type: 'back' });
    expect(history.entries[history.index].state).toBe(offered);
    const chi = currentSoloResponse(offered)!.options.find(o => o.type === 'chii')!;
    history = soloHistoryReducer(history, { type: 'act', action: { type: 'respond', choice: chi } });
    expect(history.pending).not.toBeNull();
    expect(history.entries).toHaveLength(3);
    expect(history.index).toBe(1);
    const canceled = soloHistoryReducer(history, { type: 'cancel' });
    expect(canceled.entries).toBe(history.entries);
    history = soloHistoryReducer(history, { type: 'confirm' });
    expect(history.pending).toBeNull();
    expect(history.entries[2].state.pending?.responses[0].choice).toEqual(chi);
  });

  it('invalid actions do not advance history and repeating a recorded action replays it', () => {
    const initial = fixture();
    let history: SoloHistory = { entries: [{ state: initial }], index: 0, pending: null };
    expect(soloHistoryReducer(history, { type: 'act', action: { type: 'discard', tileId: 'missing' } })).toBe(history);
    const action = { type: 'discard' as const, tileId: initial.seats.east.drawn!.id };
    history = soloHistoryReducer(history, { type: 'act', action });
    const entries = history.entries;
    history = soloHistoryReducer(history, { type: 'back' });
    history = soloHistoryReducer(history, { type: 'act', action });
    expect(history.index).toBe(1);
    expect(history.entries).toBe(entries);
    expect(history.pending).toBeNull();
  });
});

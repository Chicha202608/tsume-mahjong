import { describe, it, expect } from 'vitest';
import { scoreHand } from '@/game/scoreAdapter';
import type { State } from '@/game/gameState';
import type { Tile } from '@/types';

function makeTile(suit: Tile['suit'], value: number, isRed = false): Tile {
  return { id: `${suit}-${value}-${isRed ? 'r' : 'n'}-${Math.random().toString(36).slice(2, 8)}`, suit, value, isRed };
}

// Hand: (1m 2m 3m)(4m 5m 6m)(3p 4p 5p)(7p 8p 9p) pair(3z=west)
// Win: tsumo 9p → ryanmen wait 7p8p
// roundWind=east, seatWind=south, riichi, doraIndicator=5z(白→pega-dora=6z, not in hand)
// Expected: riichi(1) + menzen-tsumo(1) + pinfu(1) = 3han, 20fu
// basicPoints = 20 * 2^(3+2) = 640
// seatPayments: east(dealer)=1300, west=700, north=700 → total=2700
describe('scoreHand — menzen tsumo (pinfu + riichi + tsumo)', () => {
  const winTile = makeTile('sou', 9);

  const state: State = {
    playerHand: [
      makeTile('man', 1), makeTile('man', 2), makeTile('man', 3),
      makeTile('man', 4), makeTile('man', 5), makeTile('man', 6),
      makeTile('pin', 3), makeTile('pin', 4), makeTile('pin', 5),
      makeTile('sou', 7), makeTile('sou', 8),
      makeTile('wind', 3), makeTile('wind', 3), // west pair (3z)
    ],
    playerDrawnTile: winTile,
    cpuHand: [],
    wall: [],
    fullWall: [],
    wanpai: [
      makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1), // ura-dora zone
      makeTile('dragon', 3), // dora indicator = 5z (白), dora = 6z (發) — not in hand
      makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1),
      makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1),
      makeTile('pin', 1), makeTile('pin', 1),
    ],
    wallDrawnCount: 0,
    playerDiscards: [],
    cpuDiscards: [],
    playerFuro: [],
    cpuFuro: [],
    phase: 'win',
    turnCount: 10,
    lastCpuDiscard: null,
    nakiOptions: [],
    ronAvailable: false,
    winType: 'tsumo',
    doraCount: 1,
    isRiichi: true,
    tsumoAvailable: true,
    missedRonAfterRiichi: false,
    roundWind: 'east',
    playerWind: 'south',
    winTile,
  };

  const result = scoreHand(state)!;

  it('should return a valid hand', () => {
    expect(result).not.toBeNull();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should have at least one interpretation', () => {
    expect(result.handInterpretations.length).toBeGreaterThanOrEqual(1);
  });

  const best = result.handInterpretations[0];

  it('should score 3 han (riichi + tsumo + pinfu)', () => {
    const yakuNames = best.yaku.map(y => y.name);
    expect(yakuNames).toContain('riichi');
    expect(yakuNames).toContain('menzen-tsumo');
    expect(yakuNames).toContain('pinfu');
    expect(best.han).toBe(3);
  });

  it('should score 20 fu (pinfu tsumo base)', () => {
    expect(best.fu).toBe(20);
  });

  it('should have basicPoints = 640', () => {
    expect(best.basicPoints).toBe(640);
  });

  it('should have no dora, akadora, or uradora', () => {
    expect(best.dora).toBe(0);
    expect(best.akadora).toBe(0);
    expect(best.uradora).toBe(0);
  });
});

// ── Dora test ───────────────────────────────────────────────────────────────
//
// Hand: (3m 4m 5m)(3m 4m 5m)(3p 4p 5p)(5s 6s 7s) pair(2p) + tsumo 2p (tanki wait)
// roundWind=south, seatWind=west, no riichi
//
// Dora: indicator=2m → dora tile=3m (next rank, suit wraps 9→1)
//   3m appears TWICE in the hand → dora count = 2
//
// Yaku:
//   menzen-tsumo (1han) — won by self-draw with a closed hand
//   tanyao       (1han) — all tiles are simples (2–8)
//   iipeiko      (1han) — two identical runs: (3m4m5m)(3m4m5m)
//   dora×2             — two 3m tiles (dora tile = 3m)
//
// Total: 1+1+1 = 3 yaku han + 2 dora han = 5 han
//
// 5 han = mangan (uncapped point formula would exceed mangan threshold)
//   basicPoints = 2000 (mangan fixed value)
//   non-dealer tsumo: dealer pays 4000, each non-dealer pays 2000
//   totalWinnings = 4000 + 2000 + 2000 = 8000
//
// fu = 30:
//   base 20 (tsumo, non-pinfu) + tsumo 2 = 22 → rounded up to 30
describe('scoreHand — menzen tsumo with dora×2 (tanyao + iipeiko)', () => {
  const winTile = makeTile('pin', 2);

  // wanpai index [4] is the first dora indicator (doraCount=1 → slice(4, 5))
  // indicator = 2m (man value=2) → dora = 3m
  const state: State = {
    playerHand: [
      makeTile('man', 3), makeTile('man', 4), makeTile('man', 5), // run A — each 3m is a dora
      makeTile('man', 3), makeTile('man', 4), makeTile('man', 5), // run B (iipeiko)
      makeTile('pin', 3), makeTile('pin', 4), makeTile('pin', 5),
      makeTile('sou', 5), makeTile('sou', 6), makeTile('sou', 7),
      makeTile('pin', 2), // pair head — same tile as winTile (tanki wait)
    ],
    playerDrawnTile: winTile,
    cpuHand: [],
    wall: [],
    fullWall: [],
    wanpai: [
      makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1),
      makeTile('man', 2), // index 4 → dora indicator = 2m → dora tile = 3m
      makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1),
      makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1),
      makeTile('pin', 1), makeTile('pin', 1),
    ],
    wallDrawnCount: 0,
    playerDiscards: [],
    cpuDiscards: [],
    playerFuro: [],
    cpuFuro: [],
    phase: 'win',
    turnCount: 8,
    lastCpuDiscard: null,
    nakiOptions: [],
    ronAvailable: false,
    winType: 'tsumo',
    doraCount: 1,
    isRiichi: false,
    tsumoAvailable: true,
    missedRonAfterRiichi: false,
    roundWind: 'south',
    playerWind: 'west',
    winTile,
  };

  const result = scoreHand(state)!;

  it('dora: should return a valid hand', () => {
    expect(result).not.toBeNull();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  const best = result.handInterpretations[0];

  it('dora: should contain menzen-tsumo, tanyao, and iipeiko', () => {
    const yakuNames = best.yaku.map(y => y.name);
    expect(yakuNames).toContain('menzen-tsumo');
    expect(yakuNames).toContain('tanyao');
    expect(yakuNames).toContain('iipeiko');
  });

  it('dora: should count exactly 2 dora (two 3m tiles, indicator=2m)', () => {
    expect(best.dora).toBe(2);
    expect(best.akadora).toBe(0);
    expect(best.uradora).toBe(0);
  });

  it('dora: should total 5 han (3 yaku + 2 dora)', () => {
    expect(best.han).toBe(5);
  });

  it('dora: should score 30 fu', () => {
    expect(best.fu).toBe(30);
  });

  it('dora: should be mangan (basicPoints = 2000)', () => {
    expect(best.basicPoints).toBe(2000);
  });

  it('dora: totalWinnings should be 8000 (mangan non-dealer tsumo)', () => {
    expect(best.totalWinnings).toBe(8000);
  });
});

// ── Akadora (red five) test ─────────────────────────────────────────────────
//
// Hand: (2m 3m 4m)(3p 4p 0p)(5s 6s 7s)(7s 8s 9s) pair(2z=south) + tsumo 2z (tanki wait)
//   0p = red 5pin → akadora (always counted, independent of dora indicator)
// roundWind=east, seatWind=east (dealer), riichi
// Dora indicator=1m → dora tile=2m (appears once in hand) → dora=1
//
// Yaku:
//   riichi        (1han)
//   menzen-tsumo  (1han)
//   No tanyao (9s is a terminal)
//   No yakuhai (2z=south is not round-wind east nor seat-wind east)
//
// Dora breakdown:
//   dora    = 1  (one 2m, from indicator 1m)
//   akadora = 1  (one red 5pin, 0p)
//   uradora = 0  (no ura-dora indicator, not checked without riichi-ura)
//
// Total han: 1 + 1 + 1(dora) + 1(akadora) = 4
//
// fu = 30:
//   base 20 + tanki wait 2 + tsumo 2 = 24 → rounded up to 30
//
// Dealer tsumo, 4han 30fu:
//   basicPoints = 30 × 2^(4+2) = 30 × 64 = 1920
//   Each non-dealer pays ceil(1920) = 3900 (round-up to 100-unit)
//   totalWinnings = 3900 × 3 = 11700
describe('scoreHand — menzen tsumo with akadora (red 5pin)', () => {
  const winTile = makeTile('wind', 2); // 2z = south

  const state: State = {
    playerHand: [
      makeTile('man', 2), makeTile('man', 3), makeTile('man', 4),  // run (2m is dora)
      makeTile('pin', 3), makeTile('pin', 4), makeTile('pin', 5, true), // run with RED 5pin (0p = akadora)
      makeTile('sou', 5), makeTile('sou', 6), makeTile('sou', 7),
      makeTile('sou', 7), makeTile('sou', 8), makeTile('sou', 9),
      makeTile('wind', 2), // pair head — south (2z), tanki wait
    ],
    playerDrawnTile: winTile,
    cpuHand: [],
    wall: [],
    fullWall: [],
    wanpai: [
      makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1),
      makeTile('man', 1), // index 4 → dora indicator = 1m → dora tile = 2m
      makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1),
      makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1),
      makeTile('pin', 1), makeTile('pin', 1),
    ],
    wallDrawnCount: 0,
    playerDiscards: [],
    cpuDiscards: [],
    playerFuro: [],
    cpuFuro: [],
    phase: 'win',
    turnCount: 10,
    lastCpuDiscard: null,
    nakiOptions: [],
    ronAvailable: false,
    winType: 'tsumo',
    doraCount: 1,
    isRiichi: true,
    tsumoAvailable: true,
    missedRonAfterRiichi: false,
    roundWind: 'east',
    playerWind: 'east',
    winTile,
  };

  const result = scoreHand(state)!;

  it('akadora: should return a valid hand', () => {
    expect(result).not.toBeNull();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  const best = result.handInterpretations[0];

  it('akadora: should contain riichi and menzen-tsumo', () => {
    const yakuNames = best.yaku.map(y => y.name);
    expect(yakuNames).toContain('riichi');
    expect(yakuNames).toContain('menzen-tsumo');
  });

  it('akadora: should count 1 dora (one 2m from indicator 1m)', () => {
    expect(best.dora).toBe(1);
  });

  it('akadora: should count 1 akadora (red 5pin) — separate from dora', () => {
    expect(best.akadora).toBe(1);
    expect(best.uradora).toBe(0);
  });

  it('akadora: should total 4 han (riichi + tsumo + dora + akadora)', () => {
    expect(best.han).toBe(4);
  });

  it('akadora: should score 30 fu', () => {
    expect(best.fu).toBe(30);
  });

  it('akadora: basicPoints should be 1920 (30 × 2^6)', () => {
    expect(best.basicPoints).toBe(1920);
  });

  it('akadora: dealer tsumo totalWinnings should be 11700 (3900 × 3)', () => {
    expect(best.totalWinnings).toBe(11700);
  });
});

// ── Ron (menzen) test ───────────────────────────────────────────────────────
//
// Hand: (1m 2m 3m)(4m 5m 6m)(3p 4p 5p)(7p 8p __) pair(4z=north) + RON 9p
//   Closed 13 tiles, winning tile 9p is discarded by CPU (west seat) → ron
//   Wait shape: 7p 8p + 9p = ryanmen wait → qualifies for pinfu
//
// roundWind=east, seatWind=south (non-dealer), riichi
// Dora indicator=5z(白→dora=6z=發, not in hand) → dora=0
//
// Yaku:
//   riichi  (1han)
//   pinfu   (1han) — all runs, non-yakuhai pair, ryanmen wait
//   NO menzen-tsumo — ron win, not self-draw
//
// Total: 2han
//
// fu = 30:
//   base 20 + ron win 10 = 30 (pinfu ron: no additional fu from wait or pair)
//
// Non-dealer ron, 2han 30fu:
//   basicPoints = 30 × 2^(2+2) = 30 × 16 = 480
//   Ron: discarder pays basicPoints × 4 (non-dealer) = 480 × 4 = 1920 → rounded to 2000
//   totalWinnings = 2000 (paid entirely by the discarder, west)
//
// winningTile.from: cpuDirection(south) = west (next seat clockwise)
//   → riichi-score uses this to determine who pays
describe('scoreHand — menzen ron (pinfu + riichi, no tsumo yaku)', () => {
  const winTile = makeTile('sou', 9); // ron'd 9p

  const state: State = {
    playerHand: [
      makeTile('man', 1), makeTile('man', 2), makeTile('man', 3),
      makeTile('man', 4), makeTile('man', 5), makeTile('man', 6),
      makeTile('pin', 3), makeTile('pin', 4), makeTile('pin', 5),
      makeTile('sou', 7), makeTile('sou', 8), // ryanmen wait → 9p completes the run
      makeTile('wind', 4), makeTile('wind', 4), // north pair (4z, non-yakuhai for south seat)
    ],
    playerDrawnTile: null,
    cpuHand: [],
    wall: [],
    fullWall: [],
    wanpai: [
      makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1),
      makeTile('dragon', 3), // index 4 → dora indicator = 5z (白), dora = 6z (發) — not in hand
      makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1),
      makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1),
      makeTile('pin', 1), makeTile('pin', 1),
    ],
    wallDrawnCount: 0,
    playerDiscards: [],
    cpuDiscards: [],
    playerFuro: [],
    cpuFuro: [],
    phase: 'win',
    turnCount: 10,
    lastCpuDiscard: winTile,
    nakiOptions: [],
    ronAvailable: true,
    winType: 'ron',
    doraCount: 1,
    isRiichi: true,
    tsumoAvailable: false,
    missedRonAfterRiichi: false,
    roundWind: 'east',
    playerWind: 'south',
    winTile,
  };

  const result = scoreHand(state)!;

  it('ron: should return a valid hand', () => {
    expect(result).not.toBeNull();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  const best = result.handInterpretations[0];

  it('ron: should contain riichi and pinfu', () => {
    const yakuNames = best.yaku.map(y => y.name);
    expect(yakuNames).toContain('riichi');
    expect(yakuNames).toContain('pinfu');
  });

  it('ron: should NOT contain menzen-tsumo (ron, not self-draw)', () => {
    const yakuNames = best.yaku.map(y => y.name);
    expect(yakuNames).not.toContain('menzen-tsumo');
  });

  it('ron: should have no dora, akadora, or uradora', () => {
    expect(best.dora).toBe(0);
    expect(best.akadora).toBe(0);
    expect(best.uradora).toBe(0);
  });

  it('ron: should total 2 han (riichi + pinfu)', () => {
    expect(best.han).toBe(2);
  });

  it('ron: should score 30 fu (pinfu ron: base 20 + ron 10)', () => {
    expect(best.fu).toBe(30);
  });

  it('ron: basicPoints should be 480 (30 × 2^4)', () => {
    expect(best.basicPoints).toBe(480);
  });

  it('ron: totalWinnings should be 2000 (non-dealer ron, paid by west)', () => {
    expect(best.totalWinnings).toBe(2000);
  });
});

// ── Furo (pon) test ─────────────────────────────────────────────────────────
//
// Hand: closed (2m 3m 4m)(5p 6p 7p)(6s 7s 8s) pair(2z=south) + PON of 5z(白)×3
// Win: tsumo 2z (tanki wait on south pair)
//
// Furo: pung of white dragons (5z 5z 5z), called from west (CPU seat)
//   → open hand (non-menzen)
//
// roundWind=east, seatWind=south (non-dealer), NO riichi (open hand)
// Dora indicator=1m → dora tile=2m (appears once in closed hand)
//
// Yaku:
//   haku (白=white dragon triplet) (1han) — yakuhai from the pon
//   dora (1han) — one 2m from indicator 1m
//   NO menzen-tsumo — open hand (pon)
//   NO riichi — cannot declare riichi with an open hand
//   NO tanyao — 5z (honor tile) disqualifies tanyao
//   NO pinfu — has a triplet (pon), not all runs
//
// Total: 1 + 1 = 2 han
//
// fu = 30:
//   base 20 (open hand tsumo) + tsumo 2 + white dragon triplet 4 (min: 2 → 4 for open)
//   + tanki pair wait 0 (tanki wait adds 2 only for closed, open is just base)
//   → actually let's verify via the library; confirmed 30fu
//
// Non-dealer tsumo, 2han 30fu:
//   basicPoints = 30 × 2^(2+2) = 30 × 16 = 480
//   Open hand: dealer pays 1000, each non-dealer pays 500 → total = 2000
describe('scoreHand — open hand tsumo with pon of white dragons', () => {
  const winTile = makeTile('wind', 2); // 2z = south (pair head, tanki wait)

  // Pon tiles: three white dragons (5z)
  const ponTile = (suffix: string) => makeTile('dragon', 1); // dragon value=1 → 5z (白)
  const calledTile = ponTile('called');
  const ponTiles = [
    calledTile,
    makeTile('dragon', 1),
    makeTile('dragon', 1),
  ];

  const state: State = {
    playerHand: [
      makeTile('man', 2), makeTile('man', 3), makeTile('man', 4), // run (2m is dora)
      makeTile('pin', 5), makeTile('pin', 6), makeTile('pin', 7),
      makeTile('sou', 6), makeTile('sou', 7), makeTile('sou', 8),
      makeTile('wind', 2), // pair head — south (2z), tanki wait
    ],
    playerDrawnTile: winTile,
    cpuHand: [],
    wall: [],
    fullWall: [],
    wanpai: [
      makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1),
      makeTile('man', 1), // index 4 → dora indicator = 1m → dora tile = 2m
      makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1),
      makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1), makeTile('pin', 1),
      makeTile('pin', 1), makeTile('pin', 1),
    ],
    wallDrawnCount: 0,
    playerDiscards: [],
    cpuDiscards: [],
    playerFuro: [
      { type: 'pung', tiles: ponTiles, calledTile },
    ],
    cpuFuro: [],
    phase: 'win',
    turnCount: 8,
    lastCpuDiscard: null,
    nakiOptions: [],
    ronAvailable: false,
    winType: 'tsumo',
    doraCount: 1,
    isRiichi: false, // cannot riichi with open hand
    tsumoAvailable: true,
    missedRonAfterRiichi: false,
    roundWind: 'east',
    playerWind: 'south',
    winTile,
  };

  const result = scoreHand(state)!;

  it('pon: should return a valid hand', () => {
    expect(result).not.toBeNull();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  const best = result.handInterpretations[0];

  it('pon: should contain haku (white dragon yakuhai)', () => {
    const yakuNames = best.yaku.map(y => y.name);
    expect(yakuNames).toContain('haku');
  });

  it('pon: should NOT contain menzen-tsumo (open hand from pon)', () => {
    const yakuNames = best.yaku.map(y => y.name);
    expect(yakuNames).not.toContain('menzen-tsumo');
  });

  it('pon: should NOT contain riichi (open hand)', () => {
    const yakuNames = best.yaku.map(y => y.name);
    expect(yakuNames).not.toContain('riichi');
  });

  it('pon: should NOT contain tanyao (honor tile 5z present)', () => {
    const yakuNames = best.yaku.map(y => y.name);
    expect(yakuNames).not.toContain('tanyao');
  });

  it('pon: should count 1 dora (one 2m from indicator 1m)', () => {
    expect(best.dora).toBe(1);
    expect(best.akadora).toBe(0);
    expect(best.uradora).toBe(0);
  });

  it('pon: should total 2 han (haku + dora)', () => {
    expect(best.han).toBe(2);
  });

  it('pon: should score 30 fu', () => {
    expect(best.fu).toBe(30);
  });

  it('pon: basicPoints should be 480 (30 × 2^4)', () => {
    expect(best.basicPoints).toBe(480);
  });

  it('pon: totalWinnings should be 2000 (non-dealer open tsumo)', () => {
    expect(best.totalWinnings).toBe(2000);
  });
});

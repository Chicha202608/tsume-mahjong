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

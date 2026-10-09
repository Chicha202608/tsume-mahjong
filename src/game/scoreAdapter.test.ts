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

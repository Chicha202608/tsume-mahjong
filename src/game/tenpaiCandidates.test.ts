import { describe, expect, it } from 'vitest';
import { enumerateTenpaiCandidates } from '@/game/tenpaiCandidates';
import { makeInitialStateBase } from '@/game/gameState';
import type { Tile } from '@/types';

const tile = (suit: Tile['suit'], value: number, id: string): Tile => ({ suit, value, id });
describe('enumerateTenpaiCandidates', () => {
  it('finds an already available standard tenpai without special hands', () => {
    const hand = [
      tile('man',1,'m1'),tile('man',2,'m2'),tile('man',3,'m3'),
      tile('pin',1,'p1'),tile('pin',2,'p2'),tile('pin',3,'p3'),
      tile('sou',1,'s1'),tile('sou',2,'s2'),tile('sou',3,'s3'),
      tile('sou',7,'s7'),tile('sou',9,'s9'),
      tile('wind',1,'e1'),tile('wind',1,'e2'),
    ];
    const result = enumerateTenpaiCandidates(makeInitialStateBase(hand,[],[],[]));
    expect(result.some(x => x.earliestPlayerDraw === 0 && x.waits.includes(25))).toBe(true);
  });
  it('requires the missing tile to be on the player draw positions', () => {
    const hand = [
      tile('man',1,'m1'),tile('man',2,'m2'),tile('man',3,'m3'),
      tile('pin',1,'p1'),tile('pin',2,'p2'),tile('pin',3,'p3'),
      tile('sou',1,'s1'),tile('sou',2,'s2'),tile('sou',3,'s3'),
      tile('sou',7,'s7'),tile('wind',1,'e1'),tile('wind',1,'e2'),
      tile('dragon',1,'white'),
    ];
    const cpuOnly = makeInitialStateBase(hand,[],[
      tile('dragon',2,'cpu'),tile('sou',9,'cpu-s9')
    ],[]);
    // The first wall tile is the player's; second is the CPU's.
    const candidates = enumerateTenpaiCandidates(cpuOnly);
    expect(candidates.every(c => c.counts[26] === 0)).toBe(true);
  });
});

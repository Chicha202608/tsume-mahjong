import { Tile, Phase, Furo, Wind } from '@/types';
import { initGame, createDeck, shuffle, sortHand, NakiOption } from '@/gameLogic';

export type GameMode = 'two' | 'three' | 'four';

export interface State {
  mode?: GameMode;
  opponents?: { wind: Wind; hand: Tile[]; discards: Tile[] }[];
  nextSeat?: Wind;
  lastDiscardWind?: Wind;
  winFromWind?: Wind;
  temporaryFuriten?: boolean;
  playerHand: Tile[];
  playerDrawnTile: Tile | null;
  cpuHand: Tile[];
  wall: Tile[];
  fullWall: Tile[];
  wanpai: Tile[];
  wallDrawnCount: number;
  playerDiscards: Tile[];
  cpuDiscards: Tile[];
  playerFuro: Furo[];
  cpuFuro: Furo[];
  phase: Phase;
  turnCount: number;
  lastCpuDiscard: Tile | null;
  nakiOptions: NakiOption[];
  ronAvailable: boolean;
  winType: 'tsumo' | 'ron' | null;
  doraCount: number;
  isRiichi: boolean;
  tsumoAvailable: boolean;
  missedRonAfterRiichi: boolean;
  roundWind: Wind;
  playerWind: Wind;
  cpuWind: Wind;
  winTile: Tile | null;
  isIppatsu: boolean;
  /** The current drawn tile came from the dead wall. */
  drawnFromRinshan?: boolean;
  /** Extracted north tiles are bonuses, never melds. */
  playerNuki?: Tile[];
  drawnFromNuki?: boolean;
}

const winds: Wind[] = ['east', 'south', 'west', 'north'];

function randomWind(): Wind {
  return winds[Math.floor(Math.random() * winds.length)];
}

/** Four-seat order, with the CPU uniformly chosen from the other three winds. */
export function isPlayerUpwind(playerWind: Wind, cpuWind: Wind): boolean {
  return winds.indexOf(playerWind) < winds.indexOf(cpuWind);
}

export function makeInitialState(mode: GameMode = 'two'): State {
  if (mode === 'four' || mode === 'three') {
    const seats = mode === 'three' ? winds.slice(0, 3) : winds;
    const deck = shuffle(createDeck(mode));
    const playerWind = seats[Math.floor(Math.random() * seats.length)];
    const playerHand = sortHand(deck.splice(0, 13));
    const opponents = seats.filter(w => w !== playerWind).map(wind =>
      ({ wind, hand: sortHand(deck.splice(0, 13)), discards: [] as Tile[] }));
    const wanpai = deck.splice(0, 14);
    return { ...makeInitialStateBase(playerHand, opponents[0].hand, deck, wanpai, playerWind, opponents[0].wind),
      mode, opponents, playerNuki: [], nextSeat: 'east', phase: playerWind === 'east' ? 'playerDraw' : 'cpuTurn' };
  }
  const { playerHand, cpuHand, wall, wanpai } = initGame();
  const playerWind = randomWind();
  const otherSeats = winds.filter(w => w !== playerWind);
  const cpuWind = otherSeats[Math.floor(Math.random() * otherSeats.length)];
  return makeInitialStateBase(playerHand, cpuHand, wall, wanpai, playerWind, cpuWind);
}

export function makeInitialStateBase(
  playerHand: Tile[], cpuHand: Tile[], wall: Tile[], wanpai: Tile[],
  playerWind: Wind = 'east', cpuWind: Wind = 'south',
): State {
  if (playerWind === cpuWind) throw new Error('Player and CPU must occupy different seats');
  return {
    playerHand, playerDrawnTile: null,
    cpuHand, wall,
    fullWall: [...wall],
    wanpai,
    wallDrawnCount: 0,
    playerDiscards: [], cpuDiscards: [],
    playerFuro: [], cpuFuro: [],
    phase: isPlayerUpwind(playerWind, cpuWind) ? 'playerDraw' : 'cpuTurn', turnCount: 0,
    lastCpuDiscard: null, nakiOptions: [], ronAvailable: false, winType: null,
    doraCount: 1,
    isRiichi: false,
    tsumoAvailable: false,
    missedRonAfterRiichi: false,
    roundWind: randomWind(),
    playerWind,
    cpuWind,
    winTile: null,
    isIppatsu: false,
  };
}

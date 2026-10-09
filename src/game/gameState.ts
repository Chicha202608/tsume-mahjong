import { Tile, Phase, Furo, Wind } from '@/types';
import { initGame, NakiOption } from '@/gameLogic';

export interface State {
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
  winTile: Tile | null;
  isIppatsu: boolean;
}

const winds: Wind[] = ['east', 'south', 'west', 'north'];

function randomWind(): Wind {
  return winds[Math.floor(Math.random() * winds.length)];
}

export function makeInitialState(): State {
  const { playerHand, cpuHand, wall, wanpai } = initGame();
  return makeInitialStateBase(playerHand, cpuHand, wall, wanpai);
}

export function makeInitialStateBase(playerHand: Tile[], cpuHand: Tile[], wall: Tile[], wanpai: Tile[]): State {
  return {
    playerHand, playerDrawnTile: null,
    cpuHand, wall,
    fullWall: [...wall],
    wanpai,
    wallDrawnCount: 0,
    playerDiscards: [], cpuDiscards: [],
    playerFuro: [], cpuFuro: [],
    phase: 'playerDraw', turnCount: 0,
    lastCpuDiscard: null, nakiOptions: [], ronAvailable: false, winType: null,
    doraCount: 1,
    isRiichi: false,
    tsumoAvailable: false,
    missedRonAfterRiichi: false,
    roundWind: randomWind(),
    playerWind: randomWind(),
    winTile: null,
    isIppatsu: false,
  };
}

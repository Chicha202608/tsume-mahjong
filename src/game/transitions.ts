import { Tile, Phase, Furo } from '@/types';
import {
  sortHand,
  checkWinConcealed,
  canRonConcealed,
  findNakiOptions,
  sameTile,
  getWaits,
  isFuriten,
  NakiOption,
} from '@/gameLogic';
import { State } from '@/game/gameState';

export const MAX_DRAWS = 18;

export function applyPlayerDraw(cur: State): State | null {
  if (cur.phase !== 'playerDraw' || cur.wall.length === 0) return null;
  const [drawn, ...rest] = cur.wall;
  if (!drawn) return null;
  const won = checkWinConcealed([...cur.playerHand, drawn], cur.playerFuro.length);
  return {
    ...cur,
    playerDrawnTile: drawn,
    wall: rest,
    wallDrawnCount: cur.wallDrawnCount + 1,
    phase: 'playerDiscard',
    tsumoAvailable: won,
  };
}

export function applyPlayerDiscard(cur: State, tile: Tile): State | null {
  if (cur.phase !== 'playerDiscard' || !cur.playerDrawnTile) return null;
  let newHand: Tile[];
  if (tile.id === cur.playerDrawnTile.id) {
    newHand = cur.playerHand;
  } else {
    newHand = sortHand([...cur.playerHand.filter(t => t.id !== tile.id), cur.playerDrawnTile]);
  }
  const newDiscards = [...cur.playerDiscards, tile];
  const newTurnCount = cur.turnCount + 1;
  if (cur.wall.length === 0 || newTurnCount >= MAX_DRAWS) {
    return { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'exhausted', turnCount: newTurnCount };
  }
  return { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'cpuTurn', turnCount: newTurnCount };
}

export function applyCpuTurn(cur: State): State | null {
  if (cur.phase !== 'cpuTurn' || cur.wall.length === 0) return null;
  const [drawn, ...rest] = cur.wall;
  const cpuDiscard = drawn;
  const cpuAfterDiscard = cur.cpuHand;
  const newCpuDiscards = [...cur.cpuDiscards, cpuDiscard];

  const rawRon = canRonConcealed(cur.playerHand, cpuDiscard, cur.playerFuro.length);
  const furiten = isFuriten(getWaits(cur.playerHand, cur.playerFuro), cur.playerDiscards);
  const ron = rawRon && !furiten && !cur.missedRonAfterRiichi;
  const naki = cur.isRiichi ? [] : findNakiOptions(cur.playerHand, cpuDiscard);

  if (ron || naki.length > 0) {
    return {
      ...cur, cpuHand: cpuAfterDiscard, wall: rest, wallDrawnCount: cur.wallDrawnCount + 1,
      cpuDiscards: newCpuDiscards, phase: 'naki',
      lastCpuDiscard: cpuDiscard, nakiOptions: naki, ronAvailable: ron,
    };
  } else if (rest.length === 0) {
    return { ...cur, cpuHand: cpuAfterDiscard, wall: rest, wallDrawnCount: cur.wallDrawnCount + 1, cpuDiscards: newCpuDiscards, phase: 'exhausted' };
  }
  return { ...cur, cpuHand: cpuAfterDiscard, wall: rest, wallDrawnCount: cur.wallDrawnCount + 1, cpuDiscards: newCpuDiscards, phase: 'playerDraw' };
}

export function applyCallRon(cur: State): State | null {
  if (cur.phase !== 'naki' || !cur.ronAvailable || !cur.lastCpuDiscard) return null;
  return { ...cur, phase: 'win' as Phase, winType: 'ron' as const, winTile: cur.lastCpuDiscard };
}

export function applyCallNaki(cur: State, option: NakiOption): State | null {
  if (cur.phase !== 'naki' || !cur.lastCpuDiscard) return null;
  const tilesToRemove = new Set(option.tiles.map(t => t.id));
  const newHand = sortHand(cur.playerHand.filter(t => !tilesToRemove.has(t.id)));
  const newFuro: Furo = {
    tiles: [...option.tiles, cur.lastCpuDiscard],
    type: option.type,
    calledTile: cur.lastCpuDiscard,
  };
  return {
    ...cur, playerHand: newHand, playerFuro: [...cur.playerFuro, newFuro],
    phase: 'playerNakiDiscard' as Phase, nakiOptions: [], ronAvailable: false,
  };
}

export function applyPlayerNakiDiscard(cur: State, tile: Tile): State | null {
  if (cur.phase !== 'playerNakiDiscard') return null;
  const newHand = sortHand(cur.playerHand.filter(t => t.id !== tile.id));
  const newDiscards = [...cur.playerDiscards, tile];
  if (cur.wall.length === 0) {
    return { ...cur, playerHand: newHand, playerDiscards: newDiscards, phase: 'exhausted' };
  }
  return { ...cur, playerHand: newHand, playerDiscards: newDiscards, phase: 'cpuTurn', lastCpuDiscard: null };
}

export function applyPassNaki(cur: State): State | null {
  if (cur.phase !== 'naki') return null;
  const missed = cur.isRiichi && cur.ronAvailable;
  if (cur.wall.length === 0) {
    return { ...cur, phase: 'exhausted', nakiOptions: [], ronAvailable: false, missedRonAfterRiichi: cur.missedRonAfterRiichi || missed };
  }
  return { ...cur, phase: 'playerDraw', nakiOptions: [], ronAvailable: false, lastCpuDiscard: null, missedRonAfterRiichi: cur.missedRonAfterRiichi || missed };
}

export function applyPassTsumo(cur: State): State | null {
  if (!cur.tsumoAvailable) return null;
  return { ...cur, tsumoAvailable: false };
}

export function applyDeclareTsumo(cur: State): State | null {
  if (!cur.tsumoAvailable) return null;
  return { ...cur, phase: 'win' as Phase, winType: 'tsumo' as const, tsumoAvailable: false, winTile: cur.playerDrawnTile };
}

export function applyDeclareKan(cur: State, option: NakiOption): State | null {
  const tilesToRemove = new Set(option.tiles.map(t => t.id));
  const isAnkan = option.type === 'ankan';
  const isKakan = option.type === 'kakan';
  const isDaiminkan = option.type === 'daiminkan';

  let newHand: Tile[];
  let newFuroList: Furo[];

  if (isKakan) {
    const kakanTile = option.tiles[0];
    const pungIdx = cur.playerFuro.findIndex(f => f.type === 'pung' && sameTile(f.tiles[0], kakanTile));
    if (pungIdx === -1) return null;
    const pungFuro = cur.playerFuro[pungIdx];
    const upgradedFuro: Furo = {
      tiles: [...pungFuro.tiles, kakanTile],
      type: 'kakan',
      calledTile: pungFuro.calledTile,
    };
    newFuroList = [...cur.playerFuro];
    newFuroList[pungIdx] = upgradedFuro;
    if (cur.playerDrawnTile && kakanTile.id === cur.playerDrawnTile.id) {
      newHand = cur.playerHand;
    } else {
      newHand = sortHand(cur.playerHand.filter(t => t.id !== kakanTile.id));
    }
  } else if (isAnkan) {
    newHand = sortHand(cur.playerHand.filter(t => !tilesToRemove.has(t.id)));
    const newFuro: Furo = {
      tiles: option.tiles,
      type: 'ankan',
      calledTile: option.tiles[0],
    };
    newFuroList = [...cur.playerFuro, newFuro];
  } else if (isDaiminkan) {
    newHand = sortHand(cur.playerHand.filter(t => !tilesToRemove.has(t.id)));
    const newFuro: Furo = {
      tiles: [...option.tiles, cur.lastCpuDiscard!],
      type: 'daiminkan',
      calledTile: cur.lastCpuDiscard!,
    };
    newFuroList = [...cur.playerFuro, newFuro];
  } else {
    newHand = sortHand(cur.playerHand.filter(t => !tilesToRemove.has(t.id)));
    const newFuro: Furo = {
      tiles: option.tiles,
      type: 'kan',
      calledTile: cur.lastCpuDiscard ?? option.tiles[0],
    };
    newFuroList = [...cur.playerFuro, newFuro];
  }

  const [rinshan, ...restWanpai] = cur.wanpai;
  if (!rinshan) return null;

  let newWall = cur.wall;
  let newWanpai = restWanpai;
  if (cur.wall.length > 0) {
    const supplement = cur.wall[cur.wall.length - 1];
    newWall = cur.wall.slice(0, -1);
    const remainingRinshan = restWanpai.slice(0, 3);
    const doraAndUraDora = restWanpai.slice(3);
    newWanpai = [...remainingRinshan, supplement, ...doraAndUraDora];
  }

  const newDoraCount = cur.doraCount + 1;
  const won = checkWinConcealed([...newHand, rinshan], newFuroList.length);

  return {
    ...cur,
    playerHand: newHand,
    playerFuro: newFuroList,
    playerDrawnTile: rinshan,
    wall: newWall,
    wanpai: newWanpai,
    doraCount: newDoraCount,
    phase: 'playerDiscard',
    tsumoAvailable: won,
    nakiOptions: [],
    ronAvailable: false,
    lastCpuDiscard: null,
  };
}

export function applyDeclareRiichi(cur: State): State | null {
  if (cur.phase !== 'playerDiscard') return null;
  return { ...cur, phase: 'riichiSelect' as Phase };
}

export function applyRiichiDiscard(cur: State, tile: Tile): State | null {
  if (cur.phase !== 'riichiSelect' || !cur.playerDrawnTile) return null;
  let newHand: Tile[];
  if (tile.id === cur.playerDrawnTile.id) {
    newHand = cur.playerHand;
  } else {
    newHand = sortHand([...cur.playerHand.filter(t => t.id !== tile.id), cur.playerDrawnTile]);
  }
  const newDiscards = [...cur.playerDiscards, tile];
  const newTurnCount = cur.turnCount + 1;
  if (cur.wall.length === 0 || newTurnCount >= MAX_DRAWS) {
    return { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'exhausted', turnCount: newTurnCount, isRiichi: true };
  }
  return { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'cpuTurn', turnCount: newTurnCount, isRiichi: true };
}

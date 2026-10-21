import { isTableMode } from '@/game/seatFlow';
import { Tile, Phase, Furo } from '@/types';
import {
  sortHand,
  checkWinConcealed,
  canRonConcealed,
  findNakiOptions,
  sameTile,
  findLegalAnkanOptions,
  getWaits,
  isFuriten,
  NakiOption,
} from '@/gameLogic';
import { State } from '@/game/gameState';
import { canRonWithYaku, canTsumoWithYaku, type BaseScoreCache } from '@/game/scoreAdapter';
import { nextSeat, afterCpuPhase, hasFuturePlayerDraw } from '@/game/seatFlow';

export const MAX_DRAWS = 18;

export function applyPlayerDraw(cur: State, baseCache?: BaseScoreCache): State | null {
  if (cur.phase !== 'playerDraw' || cur.wall.length === 0) return null;
  const [drawn, ...rest] = cur.wall;
  if (!drawn) return null;
  const won = checkWinConcealed([...cur.playerHand, drawn], cur.playerFuro.length);
  const tsumoAvailable = won && canTsumoWithYaku({ ...cur, drawnFromRinshan: false, drawnFromNuki: false }, drawn, baseCache);
  return {
    ...cur,
    playerDrawnTile: drawn,
    ...(isTableMode(cur) ? { nextSeat: nextSeat(cur, cur.playerWind), temporaryFuriten: false } : {}),
    drawnFromRinshan: false,
    drawnFromNuki: false,
    wall: rest,
    wallDrawnCount: cur.wallDrawnCount + 1,
    phase: 'playerDiscard',
    tsumoAvailable,
  };
}

export function applyPlayerDiscard(cur: State, tile: Tile): State | null {
  if (cur.phase !== 'playerDiscard' || !cur.playerDrawnTile) return null;
  // Riichi players must tsumogiri; a paused kan decision must not unlock hand discards.
  if (cur.isRiichi && tile.id !== cur.playerDrawnTile.id) return null;
  let newHand: Tile[];
  if (tile.id === cur.playerDrawnTile.id) {
    newHand = cur.playerHand;
  } else {
    newHand = sortHand([...cur.playerHand.filter(t => t.id !== tile.id), cur.playerDrawnTile]);
  }
  const newDiscards = [...cur.playerDiscards, tile];
  const newTurnCount = cur.turnCount + 1;
  if (cur.wall.length === 0) {
    return { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'exhausted', turnCount: newTurnCount, isIppatsu: false };
  }
  return { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'cpuTurn', turnCount: newTurnCount, isIppatsu: false };
}

export function applyCpuTurn(cur: State, baseCache?: BaseScoreCache): State | null {
  if (cur.phase !== 'cpuTurn' || cur.wall.length === 0) return null;
  const discardWind = isTableMode(cur) ? cur.nextSeat! : cur.cpuWind;
  if (isTableMode(cur) && discardWind === cur.playerWind) return null;
  const afterSeat = isTableMode(cur) ? nextSeat(cur, discardWind) : undefined;
  const [drawn, ...rest] = cur.wall;
  const cpuDiscard = drawn;
  const cpuAfterDiscard = cur.cpuHand;
  const newCpuDiscards = [...cur.cpuDiscards, cpuDiscard];

  const rawRon = canRonConcealed(cur.playerHand, cpuDiscard, cur.playerFuro.length);
  const furiten = isFuriten(getWaits(cur.playerHand, cur.playerFuro), cur.playerDiscards);
  const hasYaku = rawRon && canRonWithYaku(cur, cpuDiscard, baseCache);
  const ron = hasYaku && !furiten && !cur.missedRonAfterRiichi && !cur.temporaryFuriten;
  const naki = cur.isRiichi ? [] : findNakiOptions(cur.playerHand, cpuDiscard)
    .filter(option => (option.type !== 'chii' || (cur.mode !== 'three' && (!isTableMode(cur) || discardWind === nextSeat(cur, cur.playerWind, -1)))) &&
      (option.type !== 'daiminkan' || (rest.length > 0 && cur.doraCount < 5 && cur.wanpai.length >= 14)));
  const routing = isTableMode(cur) ? {
    nextSeat: afterSeat, lastDiscardWind: discardWind, lastCpuDiscard: cpuDiscard,
    opponents: cur.opponents?.map(p => p.wind === discardWind ? { ...p, discards: [...p.discards, cpuDiscard] } : p),
  } : {};

  if (ron || naki.length > 0) {
    return {
      ...cur, ...routing, cpuHand: cpuAfterDiscard, wall: rest, wallDrawnCount: cur.wallDrawnCount + 1,
      cpuDiscards: newCpuDiscards, phase: 'naki',
      lastCpuDiscard: cpuDiscard, nakiOptions: naki, ronAvailable: ron,
    };
  } else if (rest.length === 0) {
    return { ...cur, ...routing, cpuHand: cpuAfterDiscard, wall: rest, wallDrawnCount: cur.wallDrawnCount + 1, cpuDiscards: newCpuDiscards, phase: 'exhausted' };
  }
  return { ...cur, ...routing, cpuHand: cpuAfterDiscard, wall: rest, wallDrawnCount: cur.wallDrawnCount + 1, cpuDiscards: newCpuDiscards,
    phase: isTableMode(cur) && afterSeat !== cur.playerWind ? 'cpuTurn' : 'playerDraw' };
}

export function applyCallRon(cur: State): State | null {
  if (cur.phase !== 'naki' || !cur.ronAvailable || !cur.lastCpuDiscard) return null;
  return { ...cur, phase: 'win' as Phase, winType: 'ron' as const, winTile: cur.lastCpuDiscard, isIppatsu: cur.isIppatsu,
    winFromWind: cur.lastDiscardWind ?? cur.cpuWind };
}

export function applyCallNaki(cur: State, option: NakiOption): State | null {
  if (cur.phase !== 'naki' || !cur.lastCpuDiscard) return null;
  if (cur.mode === 'three' && option.type === 'chii') return null;
  const tilesToRemove = new Set(option.tiles.map(t => t.id));
  const newHand = sortHand(cur.playerHand.filter(t => !tilesToRemove.has(t.id)));
  const newFuro: Furo = {
    tiles: [...option.tiles, cur.lastCpuDiscard],
    type: option.type,
    calledTile: cur.lastCpuDiscard,
    fromWind: cur.lastDiscardWind,
  };
  return {
    ...cur, playerHand: newHand, playerFuro: [...cur.playerFuro, newFuro],
    ...(isTableMode(cur) ? { nextSeat: nextSeat(cur, cur.playerWind) } : {}),
    phase: 'playerNakiDiscard' as Phase, nakiOptions: [], ronAvailable: false, isIppatsu: false,
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
  const temporary = isTableMode(cur) ? { temporaryFuriten: !!cur.temporaryFuriten || cur.ronAvailable } : {};
  if (cur.wall.length === 0) {
    return { ...cur, ...temporary, phase: 'exhausted', nakiOptions: [], ronAvailable: false, missedRonAfterRiichi: cur.missedRonAfterRiichi || missed };
  }
  return { ...cur, ...temporary, phase: afterCpuPhase(cur), nakiOptions: [], ronAvailable: false, lastCpuDiscard: null, missedRonAfterRiichi: cur.missedRonAfterRiichi || missed };
}

export function applyPassTsumo(cur: State): State | null {
  if (!cur.tsumoAvailable) return null;
  return { ...cur, tsumoAvailable: false };
}

export function applyDeclareTsumo(cur: State): State | null {
  if (!cur.tsumoAvailable) return null;
  return { ...cur, phase: 'win' as Phase, winType: 'tsumo' as const, tsumoAvailable: false, winTile: cur.playerDrawnTile, isIppatsu: cur.isIppatsu };
}

export function findNukiOptions(cur: State): Tile[] {
  if (cur.mode !== 'three' || cur.phase !== 'playerDiscard' || !cur.playerDrawnTile || !cur.wall.length) return [];
  const tiles = cur.isRiichi ? [cur.playerDrawnTile] : [...cur.playerHand, cur.playerDrawnTile];
  return tiles.filter(t => t.suit === 'wind' && t.value === 4);
}

/** North replacement uses the live wall's tail; it neither reveals dora nor consumes rinshan. */
export function applyNuki(cur: State, tile: Tile, baseCache?: BaseScoreCache): State | null {
  if (!findNukiOptions(cur).some(t => t.id === tile.id)) return null;
  const hand = sortHand([...cur.playerHand, cur.playerDrawnTile!].filter(t => t.id !== tile.id));
  const drawn = cur.wall[cur.wall.length - 1];
  const next: State = {
    ...cur, playerHand: hand, playerDrawnTile: drawn,
    playerNuki: [...(cur.playerNuki ?? []), tile], wall: cur.wall.slice(0, -1),
    drawnFromRinshan: false, drawnFromNuki: true, isIppatsu: false,
    temporaryFuriten: false, tsumoAvailable: false,
  };
  next.tsumoAvailable = checkWinConcealed([...hand, drawn], next.playerFuro.length) && canTsumoWithYaku(next, drawn, baseCache);
  return next;
}

export function applyDeclareKan(cur: State, option: NakiOption, baseCache?: BaseScoreCache): State | null {
  if (!cur.wall.length || cur.doraCount >= 5 || cur.wanpai.length < 14) return null;
  if (cur.isRiichi) {
    if (cur.phase !== 'playerDiscard' || option.type !== 'ankan') return null;
    const legal = findLegalAnkanOptions(cur.playerHand, cur.playerDrawnTile, cur.playerFuro, true);
    if (!legal.some(candidate =>
      candidate.tiles.length === option.tiles.length &&
      candidate.tiles.every(tile => option.tiles.some(selected => selected.id === tile.id))
    )) return null;
  }
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
      fromWind: pungFuro.fromWind,
    };
    newFuroList = [...cur.playerFuro];
    newFuroList[pungIdx] = upgradedFuro;
    if (cur.playerDrawnTile && kakanTile.id === cur.playerDrawnTile.id) {
      newHand = cur.playerHand;
    } else {
      newHand = sortHand([...cur.playerHand.filter(t => t.id !== kakanTile.id), ...(cur.playerDrawnTile ? [cur.playerDrawnTile] : [])]);
    }
  } else if (isAnkan) {
    const concealed = [...cur.playerHand, ...(cur.playerDrawnTile ? [cur.playerDrawnTile] : [])];
    newHand = sortHand(concealed.filter(t => !tilesToRemove.has(t.id)));
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
      fromWind: cur.lastDiscardWind,
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
  const tsumoAvailable = won && canTsumoWithYaku(
    { ...cur, playerHand: newHand, playerFuro: newFuroList, playerDrawnTile: rinshan, wanpai: newWanpai, doraCount: newDoraCount, wall: newWall, drawnFromRinshan: true, isIppatsu: false },
    rinshan,
    baseCache,
  );

  return {
    ...cur,
    playerHand: newHand,
    playerFuro: newFuroList,
    playerDrawnTile: rinshan,
    ...(isTableMode(cur) && isDaiminkan ? { nextSeat: nextSeat(cur, cur.playerWind) } : {}),
    drawnFromRinshan: true,
    drawnFromNuki: false,
    ...(isTableMode(cur) ? { temporaryFuriten: false } : {}),
    wall: newWall,
    wanpai: newWanpai,
    doraCount: newDoraCount,
    phase: 'playerDiscard',
    tsumoAvailable,
    nakiOptions: [],
    ronAvailable: false,
    lastCpuDiscard: null,
    isIppatsu: false,
  };
}

export function applyDeclareRiichi(cur: State): State | null {
  if (cur.phase !== 'playerDiscard') return null;
  if (isTableMode(cur) && !hasFuturePlayerDraw(cur)) return null;
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
  if (cur.wall.length === 0) {
    return { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'exhausted', turnCount: newTurnCount, isRiichi: true, isIppatsu: true };
  }
  return { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'cpuTurn', turnCount: newTurnCount, isRiichi: true, isIppatsu: true };
}

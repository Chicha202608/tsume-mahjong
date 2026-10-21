import type { CSSProperties } from 'react';
import type { State } from '@/game/gameState';
import type { Furo, Tile, Wind } from '@/types';
import { nextSeat, windLetter } from '@/game/seatFlow';
import { getDoraTileKeys, tileKey } from '@/gameLogic';
import TileCard from '@/components/TileCard';
import TableMelds from '@/components/TableMelds';

interface PublicSeat {
  hand: Tile[];
  drawn: Tile | null;
  discards: Tile[];
  furo: Furo[];
  points: number;
  riichi: boolean;
  riichiDiscardId?: string;
}

const windKanji: Record<Wind, string> = { east: '東', south: '南', west: '西', north: '北' };

const positions = [
  { x: '50%', y: 'calc(50% + 106px)', angle: 0 },
  { x: 'calc(50% + 285px)', y: '50%', angle: -90 },
  { x: '50%', y: 'calc(50% - 106px)', angle: 180 },
  { x: 'calc(50% - 285px)', y: '50%', angle: 90 },
];

/** Pure table view shared by live play and AI replay. */
export default function FourPlayerTable({ state, embedded = false, compact = false, publicSeats, activeWind }: {
  state: State; embedded?: boolean; compact?: boolean; publicSeats?: Record<Wind, PublicSeat>; activeWind?: Wind;
}) {
  const { playerWind, playerDiscards, opponents = [], wanpai, doraCount } = state;
  const allFuro = publicSeats ? Object.values(publicSeats).flatMap(seat => seat.furo) : state.playerFuro;
  const calledTileIds = new Set(allFuro
    .filter(furo => furo.type !== 'ankan')
    .map(furo => furo.calledTile.id));
  const doraKeys = getDoraTileKeys(wanpai, doraCount, state.mode);
  const isDora = (tile: Tile) => doraKeys.has(tileKey(tile));
  // Keep the fourth side free; both opponents sit beside the player.
  const relatives = state.mode === 'three' ? [0, 1, 2] : [0, 1, 2, 3];
  const positionIndex = (relative: number) => state.mode === 'three' && relative === 2 ? 3 : relative;
  const handPositions = [null,
    { left: `calc(50% + ${compact ? 410 : 430}px)`, top: '50%', angle: -90 },
    { left: '50%', top: publicSeats ? '32px' : '24px', angle: 180 },
    { left: `calc(50% - ${compact ? 410 : 430}px)`, top: '50%', angle: 90 }];
  return <div data-four-table data-three-table={state.mode === 'three' ? '' : undefined} className={`relative h-full w-full min-h-0 overflow-hidden ${embedded ? '' : 'rounded-xl border border-emerald-800 bg-[#073b2d]'}`}>
    {relatives.slice(1).map(relative => {
      const wind = nextSeat(state, playerWind, relative);
      const opponent = opponents.find(p => p.wind === wind);
      const publicSeat = publicSeats?.[wind];
      const position = handPositions[positionIndex(relative)]!;
      return <div key={wind} data-table-hand={wind} data-relative-seat={relative} aria-label={`${windKanji[wind]}家の${publicSeat ? '公開手牌' : '伏せ牌'}`} className="absolute flex items-end gap-0.5"
        style={{ left: position.left, top: position.top, transform: `translate(-50%, -50%) rotate(${position.angle}deg)` }}>
        {publicSeat ? <>
          {publicSeat.hand.map(tile => <TileCard key={tile.id} tile={tile} size="xs" dora={isDora(tile)} className="shrink-0" />)}
          {publicSeat.drawn && <TileCard tile={publicSeat.drawn} size="xs" dora={isDora(publicSeat.drawn)} className="ml-2 shrink-0" />}
          {publicSeat.furo.length > 0 && <div className="ml-4"><TableMelds furo={publicSeat.furo} wind={wind} isDora={isDora} /></div>}
        </> : Array.from({ length: 13 }, (_, i) => <TileCard key={i} tile={opponent?.hand[i] ?? { id: `back-${i}`, suit: 'man', value: 1 }}
          size="xs" faceDown className="!w-6 shrink-0" />)}
      </div>;
    })}
    {relatives.map(relativeSeat => {
      const wind = nextSeat(state, playerWind, relativeSeat);
      const relative = positionIndex(relativeSeat);
      const discards = publicSeats?.[wind].discards ?? (relative === 0 ? playerDiscards : opponents.find(p => p.wind === wind)?.discards ?? []);
      const position = publicSeats && (relative === 0 || relative === 2)
        ? { ...positions[relative], y: `calc(50% ${relative === 0 ? '+' : '-'} 88px)` }
        : compact && (relative === 1 || relative === 3)
        ? { ...positions[relative], x: `calc(50% ${relative === 1 ? '+' : '-'} 270px)` }
        : positions[relative];
      const transform = relative === 0 ? 'translateX(-50%)' : relative === 2 ? 'translate(-50%, -100%) rotate(180deg)' : `translate(-50%, -50%) rotate(${position.angle}deg)`;
      return <div key={wind} data-river-wind={wind} aria-label={`${windLetter(wind)}の河`}
        className={`absolute ${publicSeats ? 'flex flex-col gap-0.5 w-[215px] h-[178px]' : 'grid grid-cols-6 grid-rows-4 gap-0.5 w-[250px] h-[220px]'}`}
        style={{ left: position.x, top: position.y, transform, transformOrigin: 'center' }}>
        {publicSeats ? Array.from({ length: Math.ceil(discards.length / 6) }, (_, row) => <div key={row} className="flex h-[43px] shrink-0 items-center gap-0.5">
          {discards.slice(row * 6, row * 6 + 6).map(tile => <div key={tile.id} className={state.lastCpuDiscard?.id === tile.id ? 'ring-2 ring-amber-400 rounded' : ''}>
            <TileCard tile={tile} size="xs" dora={isDora(tile)} rotated={publicSeats[wind].riichiDiscardId === tile.id}
              className={calledTileIds.has(tile.id) ? 'brightness-50' : ''} />
          </div>)}
        </div>) : discards.map(tile => <div key={tile.id} className={state.lastCpuDiscard?.id === tile.id ? 'ring-2 ring-amber-400 rounded' : ''}>
          <TileCard tile={tile} size="sm" className={calledTileIds.has(tile.id) ? 'brightness-50' : ''} />
        </div>)}
      </div>;
    })}
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[152px] text-center text-emerald-100">
      {relatives.map(relativeSeat => {
        const wind: Wind = nextSeat(state, playerWind, relativeSeat);
        const relative = positionIndex(relativeSeat);
        const style: CSSProperties = relative === 0 ? { left: '50%', bottom: publicSeats ? '-4px' : '-20px', transform: 'translateX(-50%)' }
          : relative === 2 ? { left: '50%', top: publicSeats ? '-2px' : '-22px', transform: 'translateX(-50%)' }
          : { top: '50%', [relative === 1 ? 'right' : 'left']: '-24px', transform: 'translateY(-50%)' };
        const active = activeWind ? activeWind === wind : state.phase === 'cpuTurn' ? state.nextSeat === wind : relative === 0;
        return <span key={wind} style={style} className={`absolute ${publicSeats ? 'text-base leading-6' : 'text-lg'} whitespace-nowrap ${active ? 'text-amber-300' : 'text-emerald-200/70'}`}>
          {windKanji[wind]}{publicSeats?.[wind].riichi && <span className="block text-xs">立直</span>}
        </span>;
      })}
      {state.mode === 'three' && <div aria-label="抜き北" className="absolute left-1/2 -translate-x-1/2 bottom-[190px] flex items-center gap-1 whitespace-nowrap text-sky-200">
        <span className="text-sm">抜き北 ×{state.playerNuki?.length ?? 0}</span>
        {state.playerNuki?.map(tile => <TileCard key={tile.id} tile={tile} size="xs" />)}
      </div>}
      <div className={publicSeats ? 'absolute left-0 right-0 top-1/2 -translate-y-1/2' : ''}>
      {publicSeats ? <div className="text-sm leading-6">{windKanji[state.roundWind]}場 ／ ×{state.wall.length}</div> : <>
        <div className="text-base leading-7">{windKanji[state.roundWind]}場</div>
        <div className="text-sm leading-6">{state.turnCount}巡</div>
        <div className="text-sm leading-6">×{state.wall.length}</div>
      </>}
      <div aria-label="ドラ表示牌" className="flex justify-center gap-0.5 mt-1">
        {Array.from({ length: 5 }, (_, i) => <TileCard key={i} tile={wanpai[4 + i] ?? { id: `indicator-${i}`, suit: 'man', value: 1 } as Tile}
          size="xs" faceDown={!publicSeats && i >= doraCount} className={`!w-8 ${publicSeats && i >= doraCount ? 'opacity-40' : ''}`} />)}
      </div>
      </div>
    </div>
  </div>;
}

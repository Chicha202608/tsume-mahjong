import type { Furo, Tile, Wind } from '@/types';
import { seatAfter } from '@/game/seatFlow';
import TileCard from '@/components/TileCard';

/** Melds are laid out in their owner's coordinate system, then the table rotates them. */
export default function TableMelds({ furo, wind, isDora, size = 'xs' }: {
  furo: Furo[]; wind: Wind; isDora: (tile: Tile) => boolean; size?: 'xs' | 'sm';
}) {
  return <div data-table-melds={wind} aria-label="副露（全牌公開）" className="flex shrink-0 items-end gap-3">
    {furo.map((meld, index) => {
      const base = meld.type === 'kakan' ? meld.tiles.slice(0, 3) : meld.tiles;
      const concealed = meld.type === 'ankan';
      const ordinary = base.filter(tile => tile.id !== meld.calledTile.id);
      const calledIndex = meld.fromWind === seatAfter(wind) ? ordinary.length : meld.fromWind === seatAfter(wind, 2) ? 1 : 0;
      const arranged = concealed ? base : [...ordinary.slice(0, calledIndex), meld.calledTile, ...ordinary.slice(calledIndex)];
      return <div key={index} data-meld-type={meld.type} data-called-from={meld.fromWind} className="flex items-end gap-0.5">
        {arranged.map(tile => {
          const called = !concealed && tile.id === meld.calledTile.id;
          return <div key={tile.id} className="flex flex-col items-center">
            {called && meld.type === 'kakan' && <TileCard tile={meld.tiles[3]} size={size} rotated dora={isDora(meld.tiles[3])} />}
            <TileCard tile={tile} size={size} rotated={called} dora={isDora(tile)} />
          </div>;
        })}
      </div>;
    })}
  </div>;
}

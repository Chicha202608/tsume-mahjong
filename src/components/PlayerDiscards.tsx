import { Tile } from '@/types';
import TileCard from '@/components/TileCard';

interface Props {
  playerDiscards: Tile[];
  isDora: (t: Tile) => boolean;
}

export default function PlayerDiscards({ playerDiscards, isDora }: Props) {
  if (playerDiscards.length === 0) return null;
  return (
    <section className="px-4 py-2 bg-[#172917] border-b border-[#2d4a2d]">
      <span className="text-green-600 text-xs">自分の捨て牌: </span>
      <div className="inline--wrap gap-0.5 mt-1">
        {playerDiscards.map(tile => (
          <TileCard key={tile.id} tile={tile} size="xs" dora={isDora(tile)} />
        ))}
      </div>
    </section>
  );
}

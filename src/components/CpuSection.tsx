import { Tile, Furo } from '@/types';
import TileCard from '@/components/TileCard';

interface Props {
  cpuHand: Tile[];
  cpuFuro: Furo[];
  cpuDiscards: Tile[];
  lastCpuDiscard: Tile | null;
}

export default function CpuSection({ cpuHand, cpuFuro, cpuDiscards, lastCpuDiscard }: Props) {
  return (
    <section className="px-4 py-3 bg-[#152615] border-b border-[#2d4a2d]">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-green-400 text-sm font-semibold tracking-widest uppercase">
          対面 (CPU)
        </h2>
        <span className="text-green-600 text-xs">{cpuHand.length}枚</span>
      </div>
      <div className="flex flex-nowrap justify-start items-center gap-0.5 sm:gap-1 w-full max-w-full overflow-hidden px-2">
        {cpuHand.map((tile, idx) => (
          <div key={tile.id ?? idx} className="flex-1 min-w-0 max-w-[40px] flex justify-center aspect-[3/4]">
            <TileCard
              tile={tile}
              size="sm"
              faceDown
              className="w-full h-full object-contain"
            />
          </div>
        ))}
      </div>
      {cpuFuro.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-3">
          {cpuFuro.map((f, i) => (
            <div key={i} className="flex gap-0.5 bg-[#0e1e0e] rounded p-1 items-center">
              {f.tiles.map(t => (
                <TileCard key={t.id} tile={t} size="xs" rotated={t.id === f.calledTile.id} />
              ))}
            </div>
          ))}
        </div>
      )}
      {cpuDiscards.length > 0 && (
        <div className="mt-2">
          <span className="text-green-600 text-xs">捨て牌: </span>
          <div className="flex flex-wrap gap-0.5 mt-1">
            {cpuDiscards.map(tile => (
              <TileCard
                key={tile.id}
                tile={tile}
                size="xs"
                className={tile.id === lastCpuDiscard?.id ? 'ring-2 ring-red-400' : ''}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

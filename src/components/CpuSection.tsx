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
    <section className="px-3 py-1.5 bg-[#152615] border-b border-[#2d4a2d]">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-green-400 text-[10px] font-semibold tracking-wider uppercase shrink-0">
          対面 (CPU)
        </h2>
        <span className="text-green-600 text-[10px] shrink-0">{cpuHand.length}枚</span>
        {cpuFuro.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {cpuFuro.map((f, i) => (
              <div key={i} className="flex gap-0.5 bg-[#0e1e0e] rounded p-0.5 items-center">
                {f.tiles.map(t => (
                  <TileCard key={t.id} tile={t} size="xs" rotated={t.id === f.calledTile.id} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-nowrap justify-start items-center gap-0.5 w-full max-w-full overflow-hidden">
        {cpuHand.map((tile, idx) => (
          <div key={tile.id ?? idx} className="flex-1 min-w-0 max-w-[32px] flex justify-center aspect-[3/4]">
            <TileCard
              tile={tile}
              size="xs"
              faceDown
              className="w-full h-full object-contain"
            />
          </div>
        ))}
      </div>
      {cpuDiscards.length > 0 && (
        <div className="mt-1">
          <span className="text-green-600 text-[10px]">捨て牌: </span>
          <div className="flex flex-wrap gap-0.5 mt-0.5">
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

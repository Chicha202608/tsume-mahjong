import { Tile, Furo } from '@/types';
import TileCard from '@/components/TileCard';

interface Props {
  cpuHand: Tile[];
  cpuFuro: Furo[];
  cpuDiscards: Tile[];
  lastCpuDiscard: Tile | null;
  playerFuro: Furo[];
}

export default function CpuSection({ cpuHand, cpuFuro, cpuDiscards, lastCpuDiscard, playerFuro }: Props) {
  // Tiles the player called from CPU discards — dim them in the CPU's discard river.
  const calledTileIds = new Set(playerFuro.map(f => f.calledTile.id));
  return (
    <section className="px-3 py-1.5 bg-[#152615] border-b border-[#2d4a2d]">
      {cpuFuro.length > 0 && (
        <div className="flex items-center gap-2 mb-1">
          <span className="text-green-400 text-[10px] font-semibold tracking-wider uppercase shrink-0">
            副露
          </span>
          <div className="flex flex-wrap gap-1.5">
            {cpuFuro.map((f, i) => (
              <div key={i} className="flex gap-0.5 bg-[#0e1e0e] rounded p-0.5 items-center">
                {f.tiles.map(t => (
                  <TileCard key={t.id} tile={t} size="xs" rotated={t.id === f.calledTile.id} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {cpuDiscards.length > 0 && (
        <div className="mt-1">
          <span className="text-green-600 text-[10px]">捨て牌: </span>
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            {cpuDiscards.map(tile => {
              const isCalled = calledTileIds.has(tile.id);
              return (
                <TileCard
                  key={tile.id}
                  tile={tile}
                  size="xs"
                  className={[
                    tile.id === lastCpuDiscard?.id ? 'ring-2 ring-red-400' : '',
                    isCalled ? 'opacity-40 grayscale' : '',
                  ].join(' ')}
                />
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

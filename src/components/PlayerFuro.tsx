import { Tile, Furo } from '@/types';
import TileCard from '@/components/TileCard';

interface Props {
  playerFuro: Furo[];
  isDora: (t: Tile) => boolean;
}

export default function PlayerFuro({ playerFuro, isDora }: Props) {
  if (playerFuro.length === 0) return null;
  return (
    <section className="px-4 py-2 bg-[#1e3a1e] border-b border-[#2d4a2d]">
      <span className="text-amber-400 text-xs font-semibold">副露（晒し牌）: </span>
      <div className="-wrap gap-3 mt-1">
        {playerFuro.map((f, i) => {
          if (f.type === 'ankan') {
            return (
              <div key={i} className="flex gap-0.5 bg-[#0e1e0e] rounded p-1 items-end">
                {f.tiles.map((t, idx) => (
                  <TileCard
                    key={t.id}
                    tile={t}
                    size="sm"
                    dora={isDora(t)}
                    faceDown={idx === 0 || idx === 3}
                  />
                ))}
              </div>
            );
          }
          if (f.type === 'kakan') {
            const extraTile = f.tiles[3];
            return (
              <div key={i} className="flex gap-0.5 bg-[#0e1e0e] rounded p-1 items-end">
                {f.tiles.slice(0, 3).map(t => {
                  const isCalled = t.id === f.calledTile.id;
                  if (isCalled) {
                    return (
                      <div key={t.id} className="-col gap-0">
                        <TileCard tile={extraTile} size="sm" rotated dora={isDora(extraTile)} />
                        <TileCard tile={t} size="sm" rotated dora={isDora(t)} />
                      </div>
                    );
                  }
                  return <TileCard key={t.id} tile={t} size="sm" dora={isDora(t)} />;
                })}
              </div>
            );
          }
          return (
            <div key={i} className="flex gap-0.5 bg-[#0e1e0e] rounded p-1 items-center">
              {f.tiles.map(t => (
                <TileCard
                  key={t.id}
                  tile={t}
                  size="sm"
                  dora={isDora(t)}
                  rotated={t.id === f.calledTile.id}
                />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

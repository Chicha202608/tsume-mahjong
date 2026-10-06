import { Tile } from '@/types';
import TileCard from '@/components/TileCard';

export default function MiniTile({ tile }: { tile: Tile }) {
  return <TileCard tile={tile} size="xs" />;
}

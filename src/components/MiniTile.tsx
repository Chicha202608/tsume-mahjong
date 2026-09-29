import { Tile } from '@/types';

export default function MiniTile({ tile }: { tile: Tile }) {
  const label = (() => {
    switch (tile.suit) {
      case 'man': return `${tile.value}m`;
      case 'pin': return `${tile.value}p`;
      case 'sou': return `${tile.value}s`;
      case 'wind': return ['東', '南', '西', '北'][tile.value - 1];
      case 'dragon': return ['白', '發', '中'][tile.value - 1];
    }
  })();
  return (
    <span className="inline-flex items-center justify-center w-6 h-8 text-[10px] font-bold text-[#1a237e] bg-[#f8f4e8] rounded-sm border border-[#d0c8b0]">
      {label}
    </span>
  );
}

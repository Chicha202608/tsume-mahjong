import type { State } from '@/game/gameState';
import { playerDrawOffset } from '@/game/seatFlow';
import { nextDoraTile } from '@/gameLogic';
import { tileImageUrl } from '@/tileImages';
import type { Tile } from '@/types';

export interface DailyShare {
  date: string;
  hand: readonly Tile[];
  firstDraw: Tile | undefined;
  dora: Tile;
}

export function makeDailyShare(date: string, initialState: State): DailyShare {
  return {
    date,
    hand: initialState.playerHand,
    firstDraw: initialState.wall[playerDrawOffset(initialState)],
    dora: nextDoraTile(initialState.wanpai[4], initialState.mode),
  };
}

async function loadTileImage(tile: Tile): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = tileImageUrl(tile);
  await image.decode();
  return image;
}

export async function makeDailyShareImage({ date, hand, firstDraw, dora }: DailyShare): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 400;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');

  const tiles = firstDraw ? [...hand, firstDraw] : hand;
  const [doraImage, ...images] = await Promise.all([dora, ...tiles].map(loadTileImage));
  const tileWidth = 74;
  const tileHeight = 99;
  const gap = 5;
  const drawGap = firstDraw ? 20 : 0;
  const rowWidth = images.length * tileWidth + (images.length - 1) * gap + drawGap;
  const rowX = Math.floor((canvas.width - rowWidth) / 2);

  context.fillStyle = '#073b2d';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const drawTile = (image: HTMLImageElement, x: number, y: number) => {
    context.fillStyle = '#989898';
    context.beginPath();
    context.roundRect(x + 2, y + 4, tileWidth, tileHeight, 8);
    context.fill();
    context.fillStyle = '#f8f4e8';
    context.strokeStyle = '#d0c8b0';
    context.beginPath();
    context.roundRect(x, y, tileWidth, tileHeight, 8);
    context.fill();
    context.stroke();

    const scale = Math.min((tileWidth - 2) / image.naturalWidth, (tileHeight - 2) / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, x + (tileWidth - width) / 2, y + (tileHeight - height) / 2, width, height);
  };

  context.fillStyle = '#ffffff';
  context.font = 'bold 36px "Segoe UI", sans-serif';
  context.textBaseline = 'middle';
  context.fillText('ドラ', rowX, 119);
  drawTile(doraImage, rowX + 96, 69);

  let x = rowX;
  images.forEach((image, index) => {
    if (firstDraw && index === hand.length) x += drawGap;
    drawTile(image, x, 226);
    x += tileWidth + gap;
  });
  const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!png) throw new Error('Unable to encode the share image');
  return new File([png], `tsume-mahjong-${date}.png`, { type: png.type });
}

import { useEffect, useId, useRef, useState } from 'react';
import { dailyRoundSearch } from '@/game/dailyRound';
import { tileDisplay } from '@/gameLogic';
import { makeDailyShareImage, type DailyShare } from '@/components/dailyShareImage';

export default function ShareResultLink({ result, className, dailyShare }: { result: string; className: string; dailyShare?: DailyShare }) {
  const dailyDate = dailyShare?.date;
  const productionOrigin = dailyDate ? import.meta.env.VITE_DAILY_SHARE_ORIGIN : undefined;
  const appUrl = new URL(import.meta.env.BASE_URL, productionOrigin || window.location.origin);
  const shareUrl = new URL('https://twitter.com/intent/tweet');
  if (dailyDate) appUrl.search = dailyRoundSearch(dailyDate);
  const text = dailyDate
    ? `詰め麻雀｜${dailyDate}の一局\n私は${result}でした。同じ牌山で、あなたなら何点取れる？\nこの一局を打つ ↓`
    : `ツモ山が全部見える麻雀。あなたなら何点取れる？\n\n私の結果：${result}\n\n詰め麻雀で遊ぶ ↓`;
  const hashtag = '詰め麻雀';
  shareUrl.searchParams.set('text', text);
  shareUrl.searchParams.set('url', appUrl.href);
  shareUrl.searchParams.set('hashtags', hashtag);

  if (dailyShare) return <DailyShareButton dailyShare={dailyShare} shareUrl={shareUrl.href} shareText={`${text}\n${appUrl.href}\n#${hashtag}`} className={className} />;

  return (
    <a href={shareUrl.href} target="_blank" rel="noopener noreferrer" className={className}>
      Xでシェア
    </a>
  );
}

function DailyShareButton({ dailyShare, shareUrl, shareText, className }: {
  dailyShare: DailyShare;
  shareUrl: string;
  shareText: string;
  className: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [imageFile, setImageFile] = useState<File>();
  const [imageUrl, setImageUrl] = useState<string>();
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing' | 'error'>('idle');
  const canShareImage = !!imageFile && typeof navigator.share === 'function' && navigator.canShare?.({ files: [imageFile] });

  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  async function prepareImage() {
    setStatus('loading');
    try {
      setImageFile(await makeDailyShareImage(dailyShare));
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  function openPreview() {
    dialog.current?.showModal();
    if (!imageFile && status !== 'loading') void prepareImage();
  }

  async function shareImage() {
    if (!canShareImage || !imageFile) return;
    setShareStatus('sharing');
    try {
      await navigator.share({ files: [imageFile], text: shareText });
      setShareStatus('idle');
    } catch (error) {
      setShareStatus(error instanceof DOMException && error.name === 'AbortError' ? 'idle' : 'error');
    }
  }

  const hand = dailyShare.hand.map(tile => tileDisplay(tile).label).join('、');
  const draw = dailyShare.firstDraw ? `。最初のツモ牌は${tileDisplay(dailyShare.firstDraw).label}` : '';
  const dora = tileDisplay(dailyShare.dora).label;
  const manualShare = (
    <div className="flex flex-wrap gap-2">
      {imageUrl && imageFile && <a href={imageUrl} download={imageFile.name} className="rounded-lg bg-green-700 px-3 py-2 text-sm font-bold hover:bg-green-600">画像を保存</a>}
      <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-bold hover:bg-emerald-900">Xの投稿画面を開く</a>
    </div>
  );

  return (
    <>
      <button type="button" onClick={openPreview} className={className}>Xでシェア</button>
      <dialog ref={dialog} aria-labelledby={titleId} className="m-auto w-[min(92vw,32rem)] max-h-[90dvh] overflow-y-auto rounded-2xl border border-emerald-700 bg-[#152615] p-5 text-white backdrop:bg-black/70">
        <h2 id={titleId} className="text-xl font-bold">Xでシェア</h2>
        {imageUrl && <p className="my-3 text-sm text-emerald-100">
          {canShareImage ? '共有メニューにXが表示されたら選んでください。' : '画像を保存し、Xの投稿画面で添付してください。'}
        </p>}
        {status === 'loading' && <p role="status" className="py-5 text-sm text-emerald-100">画像を準備しています…</p>}
        {status === 'error' && <div className="my-3 flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-amber-200">画像を作成できませんでした。</p>
          <button type="button" onClick={prepareImage} className="rounded-lg border border-emerald-700 px-3 py-2 text-sm">再試行</button>
        </div>}
        {imageUrl && <img src={imageUrl} width={1200} height={400} alt={`ドラは${dora}。手牌は${hand}${draw}`} className="w-full rounded-lg" />}
        <div className="mt-4 flex flex-wrap gap-2">
          {canShareImage
            ? <button type="button" onClick={shareImage} disabled={shareStatus === 'sharing'} className="rounded-lg bg-green-700 px-3 py-2 text-sm font-bold hover:bg-green-600 disabled:opacity-50">画像と結果を共有</button>
            : manualShare}
          <button type="button" onClick={() => dialog.current?.close()} className="ml-auto rounded-lg px-3 py-2 text-sm hover:bg-emerald-900">閉じる</button>
        </div>
        {canShareImage && <details open={shareStatus === 'error' || undefined} className="mt-3 text-sm text-emerald-100">
          <summary className="cursor-pointer py-2">Xが共有先にない場合</summary>
          {shareStatus === 'error' && <p role="alert" className="mb-2 text-amber-200">共有メニューを開けませんでした。</p>}
          <p className="mb-2">画像を保存し、Xの投稿画面で添付してください。</p>
          {manualShare}
        </details>}
      </dialog>
    </>
  );
}

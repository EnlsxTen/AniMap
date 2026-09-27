import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Image as ImageIcon, RotateCcw, X } from 'lucide-react';

const OUTPUT_WIDTH = 1600;
const OUTPUT_HEIGHT = 1000;
const MAX_ZOOM = 4;

type PosterCropperProps = {
  file: File | null;
  onCancel: () => void;
  onConfirm: (file: File, previewUrl: string) => void;
};

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = url;
});

const canvasToBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Failed to crop poster')), 'image/webp', 0.9);
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const PosterCropper: React.FC<PosterCropperProps> = ({ file, onCancel, onConfirm }) => {
  const objectUrl = useMemo(() => file ? URL.createObjectURL(file) : '', [file]);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);

  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);

  useEffect(() => {
    if (!file) return undefined;

    const originalOverflow = document.body.style.overflow;
    const originalOverscrollBehavior = document.body.style.overscrollBehavior;
    const originalTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.body.style.touchAction = 'none';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.overscrollBehavior = originalOverscrollBehavior;
      document.body.style.touchAction = originalTouchAction;
    };
  }, [file]);

  useEffect(() => {
    if (!objectUrl) return;
    loadImage(objectUrl).then((image) => {
      imageRef.current = image;
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      setScale(1);
      setOffset({ x: 0, y: 0 });
    }).catch(() => onCancel());
  }, [objectUrl, onCancel]);

  useEffect(() => {
    if (!frameRef.current) return undefined;

    const update = () => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (rect) setFrameSize({ width: rect.width, height: rect.height });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(frameRef.current);
    window.addEventListener('resize', update);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [file]);

  const fitScale = imageSize.width && imageSize.height && frameSize.width && frameSize.height
    ? Math.min(frameSize.width / imageSize.width, frameSize.height / imageSize.height)
    : 1;
  const displayWidth = imageSize.width * fitScale * scale;
  const displayHeight = imageSize.height * fitScale * scale;
  const baseX = (frameSize.width - displayWidth) / 2;
  const baseY = (frameSize.height - displayHeight) / 2;
  const maxOffsetX = Math.max(0, (displayWidth - frameSize.width) / 2);
  const maxOffsetY = Math.max(0, (displayHeight - frameSize.height) / 2);
  const clampedOffset = {
    x: clamp(offset.x, -maxOffsetX, maxOffsetX),
    y: clamp(offset.y, -maxOffsetY, maxOffsetY),
  };

  useEffect(() => {
    if (offset.x !== clampedOffset.x || offset.y !== clampedOffset.y) setOffset(clampedOffset);
  }, [clampedOffset.x, clampedOffset.y, offset.x, offset.y]);

  const imageX = baseX + clampedOffset.x;
  const imageY = baseY + clampedOffset.y;

  const stopBackgroundGesture = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    setOffset({ x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const drawCoverBackground = (ctx: CanvasRenderingContext2D, image: HTMLImageElement) => {
    const coverScale = Math.max(OUTPUT_WIDTH / image.naturalWidth, OUTPUT_HEIGHT / image.naturalHeight);
    const width = image.naturalWidth * coverScale;
    const height = image.naturalHeight * coverScale;
    ctx.save();
    ctx.filter = 'blur(28px) brightness(0.86) saturate(1.08)';
    ctx.drawImage(image, (OUTPUT_WIDTH - width) / 2, (OUTPUT_HEIGHT - height) / 2, width, height);
    ctx.restore();
  };

  const handleConfirm = async () => {
    if (!file || !imageRef.current || !frameSize.width || !frameSize.height || !displayWidth || !displayHeight) return;
    setProcessing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_WIDTH;
      canvas.height = OUTPUT_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      drawCoverBackground(ctx, imageRef.current);
      const ratioX = OUTPUT_WIDTH / frameSize.width;
      const ratioY = OUTPUT_HEIGHT / frameSize.height;
      ctx.drawImage(imageRef.current, imageX * ratioX, imageY * ratioY, displayWidth * ratioX, displayHeight * ratioY);

      const blob = await canvasToBlob(canvas);
      const cropped = new File([blob], file.name.replace(/\.[^.]+$/, '') + '-poster.webp', { type: 'image/webp' });
      onConfirm(cropped, URL.createObjectURL(blob));
    } catch {
      onCancel();
    } finally {
      setProcessing(false);
    }
  };

  if (!file) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex touch-none items-center justify-center overflow-hidden overscroll-none bg-ink/75 p-4 sm:backdrop-blur-sm"
      onClick={onCancel}
      onPointerDown={stopBackgroundGesture}
      onPointerMove={stopBackgroundGesture}
      onPointerUp={stopBackgroundGesture}
      onTouchMove={stopBackgroundGesture}
      onWheel={stopBackgroundGesture}
    >
      <div className="w-full max-w-2xl transform-none rounded-2xl border-3 border-ink bg-white p-4 shadow-block transition-none hover:transform-none active:transform-none dark:border-night-400 dark:bg-night-100 sm:p-5" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-display text-lg text-ink dark:text-primary-100"><ImageIcon className="h-5 w-5" />裁剪活动海报</div>
          <button type="button" onClick={onCancel} className="btn-secondary !h-9 !w-9 !p-0" aria-label="关闭裁剪"><X className="h-4 w-4" /></button>
        </div>
        <div
          ref={frameRef}
          className="relative aspect-[16/10] w-full touch-none select-none overflow-hidden rounded-xl border-3 border-ink bg-ink/10 transition-none dark:border-night-400"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={stopBackgroundGesture}
          onTouchMove={stopBackgroundGesture}
        >
          {objectUrl && <img src={objectUrl} alt="模糊背景" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover blur-2xl brightness-90 saturate-110" />}
          {objectUrl && <img src={objectUrl} alt="待裁剪海报" draggable={false} className="pointer-events-none absolute max-w-none select-none" style={{ width: displayWidth, height: displayHeight, transform: `translate(${imageX}px, ${imageY}px)` }} />}
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex flex-1 items-center gap-3 text-sm text-ink-muted dark:text-primary-100/70">
            缩放
            <input type="range" min="1" max={MAX_ZOOM} step="0.01" value={scale} onChange={(event) => setScale(Number(event.target.value))} className="w-full accent-primary-600" />
          </label>
          <button type="button" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} className="btn-secondary !px-4 !py-2.5 !text-sm"><RotateCcw className="h-4 w-4" />重置</button>
          <button type="button" onClick={handleConfirm} disabled={processing} className="btn-action !px-4 !py-2.5 !text-sm"><Check className="h-4 w-4" />{processing ? '处理中...' : '确认裁剪'}</button>
        </div>
        <p className="mt-3 text-xs text-ink-muted dark:text-primary-100/60">最小缩放会把原图完整塞进裁剪框，空白区域使用模糊背景填充；导出尺寸为 1600x1000。</p>
      </div>
    </div>
  );
};

export default PosterCropper;



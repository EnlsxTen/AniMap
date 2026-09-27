import { useState, useEffect } from 'react';

type Theme = 'dark' | 'light';

// 按图片 url 缓存检测结果，避免列表中同一图反复创建 canvas + getImageData（同步阻塞主线程）
const brightnessCache = new Map<string, Theme>();

/**
 * 检测图片亮度，返回 'dark'（图片暗→用白色文字）或 'light'（图片亮→用深色文字）
 * 默认返回 'dark'（白色文字），适合大多数场景
 */
export const useImageBrightness = (imageUrl: string | null): Theme => {
  const [theme, setTheme] = useState<Theme>(() => (imageUrl && brightnessCache.get(imageUrl)) || 'dark');

  useEffect(() => {
    if (!imageUrl) {
      setTheme('dark');
      return;
    }

    // 命中缓存直接返回，跳过 canvas 计算
    const cached = brightnessCache.get(imageUrl);
    if (cached) {
      setTheme(cached);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        // 采样缩小到 50x50 提高性能
        const size = 50;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setTheme('dark'); return; }

        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;

        let totalBrightness = 0;
        const pixelCount = data.length / 4;

        for (let i = 0; i < data.length; i += 4) {
          // 加权亮度公式 (ITU-R BT.601)
          totalBrightness += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        }

        const avgBrightness = totalBrightness / pixelCount;
        // 亮度 > 128 → 浅色图片 → 用深色文字
        const result: Theme = avgBrightness > 128 ? 'light' : 'dark';
        brightnessCache.set(imageUrl, result);
        setTheme(result);
      } catch {
        // Canvas 跨域等错误，fallback 到 dark（不缓存，下次可重试）
        setTheme('dark');
      }
    };

    img.onerror = () => {
      if (!cancelled) setTheme('dark');
    };

    img.src = imageUrl;

    return () => { cancelled = true; };
  }, [imageUrl]);

  return theme;
};

export const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || '';

if (!AMAP_KEY) {
  console.warn('[amap] VITE_AMAP_KEY is not set. Map will not load correctly.');
}

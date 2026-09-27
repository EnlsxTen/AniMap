import { User } from '../types';

export const getStoredUser = (): User | null => {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }
  return null;
};

export const getStoredToken = (): string | null => {
  return localStorage.getItem('token');
};

export const isAuthenticated = (): boolean => {
  return !!getStoredToken();
};

export const hasRequiredRole = (roles: Array<User['role']>): boolean => {
  const user = getStoredUser();
  return !!user && roles.includes(user.role);
};

export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const responseData = (error as any)?.response?.data;

  if (typeof responseData?.error === 'string' && responseData.error.trim()) {
    return responseData.error;
  }

  if (Array.isArray(responseData?.errors) && responseData.errors.length > 0) {
    const firstError = responseData.errors[0];

    if (typeof firstError === 'string' && firstError.trim()) {
      return firstError;
    }

    if (typeof firstError?.msg === 'string' && firstError.msg.trim()) {
      return firstError.msg;
    }
  }

  const message = (error as any)?.message;
  if (typeof message === 'string' && message.trim() && message !== 'Network Error') {
    return message;
  }

  return fallback;
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

type ImageVariant = 'original' | 'medium' | 'preview' | 'thumb';

const getImageVariantPath = (path: string, variant: ImageVariant): string => {
  if (variant === 'original' || !path.startsWith('/uploads/')) return path;

  const [filePath, query] = path.split('?');
  const extIndex = filePath.lastIndexOf('.');
  const base = extIndex >= 0 ? filePath.slice(0, extIndex) : filePath;
  return `${base}.${variant}.webp${query ? `?${query}` : ''}`;
};

// CDN 开关：改为 true 时全局切到 R2
const USE_R2 = true;
const R2_CDN = 'https://cdn.icoser.club';

export const getImageUrl = (path: string | null, variant: ImageVariant = 'original'): string => {
  if (!path) {
    return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="%23f3f4f6" width="400" height="300"/><text x="200" y="145" text-anchor="middle" fill="%239ca3af" font-family="sans-serif" font-size="18">暂无图片</text></svg>');
  }
  if (path.startsWith('http')) return path;

  // R2 CDN 模式
  if (USE_R2 && path.startsWith('/uploads/')) {
    const variantPath = getImageVariantPath(path, variant);
    const key = variantPath.replace(/^\/uploads\//, '');
    return `${R2_CDN}/${key}?v=1`;
  }

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
  const baseUrl = apiUrl === '/api' ? '' : apiUrl.replace(/\/api\/?$/, '');
  return `${baseUrl}${getImageVariantPath(path, variant)}`;
};

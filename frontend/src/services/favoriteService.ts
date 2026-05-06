import api from './api';
import { Favorite } from '../types';

export const favoriteService = {
  toggle: (item_type: 'event' | 'venue' | 'session', item_id: number): Promise<{ favorited: boolean }> =>
    api.post('/favorites/toggle', { item_type, item_id }).then(r => r.data),

  getMyFavorites: (): Promise<{ favorites: Favorite[] }> =>
    api.get('/favorites/my').then(r => r.data),

  // 获取所有收藏的 key 集合（如 "event-1"），用于初始化前端收藏状态
  getMyFavoriteKeys: (): Promise<{ keys: string[] }> =>
    api.get('/favorites/keys').then(r => r.data),
  setReminder: (id: number, enabled: boolean): Promise<{ reminder_enabled: boolean }> =>
    api.patch(`/favorites/${id}/reminder`, { enabled }).then(r => r.data),
};

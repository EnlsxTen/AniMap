import api from './api';

export interface PublicCacheKeyState {
  name: string;
  key: string;
  exists: boolean;
  ttlSeconds: number;
}

export interface PublicCacheStats {
  enabled: boolean;
  connected: boolean;
  hitRate: number | null;
  hits: number;
  misses: number;
  total: number;
  expiredKeys: number;
  evictedKeys: number;
  memory: {
    used: string | null;
    peak: string | null;
    max: string | null;
    policy: string | null;
  } | null;
  keys: PublicCacheKeyState[];
}

export interface HomeFabSettings {
  event: boolean;
  venue: boolean;
  session: boolean;
  dance: boolean;
}

// ==========================================================================
// 插件体系（/api/plugins）
// ==========================================================================

export type PluginStatusTone = 'normal' | 'success' | 'warning' | 'danger';

export interface PluginStatusField {
  label: string;
  value: string;
  tone?: PluginStatusTone;
}

export interface PluginStatus {
  running?: boolean;
  fields: PluginStatusField[];
  detail?: string;
}

export type PluginSettingFieldType = 'boolean' | 'string' | 'number' | 'select' | 'secret';

export interface PluginSettingView {
  key: string;
  label: string;
  type: PluginSettingFieldType;
  /** 当前值；secret 类型为脱敏后的展示值 */
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  helpText: string;
}

export interface PluginRunAction {
  id: string;
  label: string;
  danger?: boolean;
}

export interface PluginView {
  id: string;
  name: string;
  description: string;
  version: string;
  scheduleHint: string;
  runActions: PluginRunAction[];
  /** true = 通过 .ami 导入的插件（可卸载） */
  imported: boolean;
  settings: PluginSettingView[];
  status: PluginStatus | null;
}

export const pluginsService = {
  list: async (): Promise<PluginView[]> => {
    const response = await api.get<{ plugins: PluginView[] }>('/plugins');
    return response.data.plugins;
  },

  getStatus: async (id: string): Promise<PluginStatus> => {
    const response = await api.get<PluginStatus>(`/plugins/${id}/status`);
    return response.data;
  },

  updateSettings: async (id: string, values: Record<string, string>): Promise<{ message: string }> => {
    const response = await api.put<{ message: string }>(`/plugins/${id}/settings`, values);
    return response.data;
  },

  run: async (id: string, action?: string, options?: Record<string, unknown>): Promise<{ started: boolean; running: boolean; message: string }> => {
    const response = await api.post<{ started: boolean; running: boolean; message: string }>(`/plugins/${id}/run`, { action, options });
    return response.data;
  },

  /** 导入 .ami 插件包（zip 格式）。导入的插件与内置插件同权限运行，调用前须向用户确认风险。 */
  import: async (file: File): Promise<{ message: string; plugin: { id: string; name: string; version: string } }> => {
    const formData = new FormData();
    formData.append('plugin', file);
    const response = await api.post<{ message: string; plugin: { id: string; name: string; version: string } }>('/plugins/import', formData);
    return response.data;
  },

  /** 卸载导入的插件（内置插件会被后端拒绝）。settings 保留，重装后自动恢复。 */
  uninstall: async (id: string): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(`/plugins/${id}`);
    return response.data;
  },
};

export const settingsService = {
  getAuthBg: async (): Promise<{ url: string | null }> => {
    const response = await api.get<{ url: string | null }>('/settings/auth-bg');
    return response.data;
  },

  updateAuthBg: async (file: File): Promise<{ message: string; url: string }> => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await api.put<{ message: string; url: string }>('/settings/auth-bg', formData);
    return response.data;
  },

  deleteAuthBg: async (): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>('/settings/auth-bg');
    return response.data;
  },

  getCacheStats: async (): Promise<PublicCacheStats> => {
    const response = await api.get<PublicCacheStats>('/settings/cache-stats');
    return response.data;
  },

  checkMissingThumbnails: async (): Promise<{ total: number; missing: number; files: string[] }> => {
    const response = await api.get<{ total: number; missing: number; files: string[] }>('/settings/thumbnails/check');
    return response.data;
  },

  regenerateThumbnails: async (): Promise<{ processed: number; skipped: number; errors: number; total: number }> => {
    const response = await api.post<{ processed: number; skipped: number; errors: number; total: number }>('/settings/thumbnails/regenerate');
    return response.data;
  },

  getHomeFab: async (): Promise<HomeFabSettings> => {
    const response = await api.get<HomeFabSettings>('/settings/home-fab');
    return response.data;
  },

  updateHomeFab: async (settings: HomeFabSettings): Promise<HomeFabSettings & { message: string }> => {
    const response = await api.put<HomeFabSettings & { message: string }>('/settings/home-fab', settings);
    return response.data;
  },
};

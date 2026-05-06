import api from './api';

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
};

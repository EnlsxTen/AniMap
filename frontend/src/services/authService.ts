import api from './api';
import { AdminUsersResponse, AuthResponse, MerchantApprovalResponse, PendingMerchantsResponse, ProfileResponse } from '../types';

export const authService = {
  register: async (email: string, password: string, username: string, userType: 'merchant' | 'personal', verificationCode: string, phone?: string): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/register', {
      email,
      password,
      username,
      userType,
      verificationCode,
      phone,
    });
    return response.data;
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login', {
      email,
      password,
    });
    return response.data;
  },

  sendVerificationCode: async (email: string, purpose: 'register' | 'login' | 'reset'): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>('/auth/send-code', {
      email,
      purpose,
    });
    return response.data;
  },

  loginByCode: async (email: string, code: string): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login-by-code', {
      email,
      code,
    });
    return response.data;
  },

  forgotPassword: async (email: string, code: string, newPassword: string): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>('/auth/forgot-password', {
      email,
      code,
      newPassword,
    });
    return response.data;
  },

  getProfile: async (): Promise<ProfileResponse> => {
    const response = await api.get<ProfileResponse>('/auth/profile');
    return response.data;
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<AuthResponse> => {
    const response = await api.patch<AuthResponse>('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  },

  updateAvatar: async (file: File): Promise<ProfileResponse & { message: string }> => {
    const formData = new FormData();
    formData.append('avatar', file);
    const response = await api.put<ProfileResponse & { message: string }>('/auth/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getPendingMerchants: async (): Promise<PendingMerchantsResponse> => {
    const response = await api.get<PendingMerchantsResponse>('/auth/admin/pending-merchants');
    return response.data;
  },

  updateMerchantApproval: async (id: number, approvalStatus: 'approved' | 'rejected'): Promise<MerchantApprovalResponse> => {
    const response = await api.patch<MerchantApprovalResponse>(`/auth/admin/merchants/${id}/approval`, {
      approvalStatus,
    });
    return response.data;
  },

  getAdminUsers: async (): Promise<AdminUsersResponse> => {
    const response = await api.get<AdminUsersResponse>('/auth/admin/users');
    return response.data;
  },

  deleteAdminUser: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(`/auth/admin/users/${id}`);
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
};

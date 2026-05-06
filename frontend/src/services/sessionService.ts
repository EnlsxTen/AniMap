import api from './api';
import { SessionsResponse, SessionResponse } from '../types';

export const sessionService = {
  getPublicSessions: (): Promise<SessionsResponse> =>
    api.get('/sessions/public').then(r => r.data),

  getVenueSessions: (venueId: number): Promise<SessionsResponse> =>
    api.get(`/sessions/venue/${venueId}`).then(r => r.data),

  getMySessions: (): Promise<SessionsResponse> =>
    api.get('/sessions/merchant/my-sessions').then(r => r.data),

  getSessionById: (id: number): Promise<SessionResponse> =>
    api.get(`/sessions/${id}`).then(r => r.data),

  createSession: (data: Record<string, any>): Promise<SessionResponse> =>
    api.post('/sessions', data).then(r => r.data),

  updateSession: (id: number, data: Record<string, any>): Promise<SessionResponse> =>
    api.put(`/sessions/${id}`, data).then(r => r.data),

  deleteSession: (id: number): Promise<{ message: string }> =>
    api.delete(`/sessions/${id}`).then(r => r.data),

  register: (id: number, note?: string): Promise<{ message: string; booked_seats: number; is_full: boolean }> =>
    api.post(`/sessions/${id}/register`, { note }).then(r => r.data),

  cancelRegistration: (id: number): Promise<{ message: string }> =>
    api.delete(`/sessions/${id}/register`).then(r => r.data),
};

import api from './api';
import { EventsResponse, EventResponse } from '../types';

export const eventService = {
  getPublicEvents: async (): Promise<EventsResponse> => {
    const response = await api.get<EventsResponse>('/events/public');
    return response.data;
  },

  getEventById: async (id: number): Promise<EventResponse> => {
    const response = await api.get<EventResponse>(`/events/${id}`);
    return response.data;
  },

  getMerchantEvents: async (): Promise<EventsResponse> => {
    const response = await api.get<EventsResponse>('/events/merchant/my-events');
    return response.data;
  },

  createEvent: async (formData: FormData): Promise<EventResponse> => {
    const response = await api.post<EventResponse>('/events', formData);
    return response.data;
  },

  updateEvent: async (id: number, formData: FormData): Promise<EventResponse> => {
    const response = await api.put<EventResponse>(`/events/${id}`, formData);
    return response.data;
  },

  deleteEvent: async (id: number): Promise<void> => {
    await api.delete(`/events/${id}`);
  },

  getPendingEvents: async (): Promise<EventsResponse> => {
    const response = await api.get<EventsResponse>('/events/admin/pending');
    return response.data;
  },

  updateEventStatus: async (id: number, status: 'approved' | 'rejected'): Promise<EventResponse> => {
    const response = await api.patch<EventResponse>(`/events/${id}/status`, { status });
    return response.data;
  },
};

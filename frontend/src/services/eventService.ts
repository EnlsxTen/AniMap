import api from './api';
import { DeleteCommentResponse, EventCommentResponse, EventCommentsResponse, EventsResponse, EventResponse, MyEventCommentsResponse } from '../types';

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

  updateEventStatus: async (id: number, status: 'approved' | 'rejected', note?: string): Promise<EventResponse> => {
    const response = await api.patch<EventResponse>(`/events/${id}/status`, { status, note });
    return response.data;
  },

  getEventComments: async (id: number): Promise<EventCommentsResponse> => {
    const response = await api.get<EventCommentsResponse>(`/events/${id}/comments`);
    return response.data;
  },

  createEventComment: async (id: number, content: string): Promise<EventCommentResponse> => {
    const response = await api.post<EventCommentResponse>(`/events/${id}/comments`, { content });
    return response.data;
  },

  getMyEventComments: async (): Promise<MyEventCommentsResponse> => {
    const response = await api.get<MyEventCommentsResponse>('/events/comments/mine');
    return response.data;
  },

  deleteMyEventComment: async (id: number): Promise<DeleteCommentResponse> => {
    const response = await api.delete<DeleteCommentResponse>(`/events/comments/${id}`);
    return response.data;
  },
};

import api from './api';
import { VenuesResponse, VenueResponse, VenueNavPhoto } from '../types';

export const venueService = {
  getPublicVenues: (): Promise<VenuesResponse> =>
    api.get('/venues/public').then(r => r.data),

  getVenueById: (id: number): Promise<VenueResponse> =>
    api.get(`/venues/${id}`).then(r => r.data),

  getMerchantVenues: (): Promise<VenuesResponse> =>
    api.get('/venues/merchant/my-venues').then(r => r.data),

  createVenue: (data: FormData): Promise<VenueResponse> =>
    api.post('/venues', data, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data),

  updateVenue: (id: number, data: FormData): Promise<VenueResponse> =>
    api.put(`/venues/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data),

  deleteVenue: (id: number): Promise<{ message: string }> =>
    api.delete(`/venues/${id}`).then(r => r.data),

  getPendingVenues: (): Promise<VenuesResponse> =>
    api.get('/venues/admin/pending').then(r => r.data),

  updateVenueStatus: (id: number, status: 'pending' | 'approved' | 'rejected', note?: string): Promise<VenueResponse> =>
    api.patch(`/venues/${id}/status`, { status, note }).then(r => r.data),

  uploadNavPhotos: (id: number, data: FormData): Promise<{ message: string; photos: VenueNavPhoto[] }> =>
    api.post(`/venues/${id}/nav-photos`, data, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data),

  deleteNavPhoto: (venueId: number, photoId: number): Promise<{ message: string }> =>
    api.delete(`/venues/${venueId}/nav-photos/${photoId}`).then(r => r.data),
};

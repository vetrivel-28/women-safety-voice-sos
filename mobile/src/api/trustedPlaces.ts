import { apiClient } from './client';
import { TrustedPlace, TrustedPlaceLabel } from '../types';

export interface CreateTrustedPlacePayload {
  name: string;
  label?: TrustedPlaceLabel | null;
  latitude: number;
  longitude: number;
  address?: string | null;
  radius_meters?: number;
  notify_guardians_on_arrival?: boolean;
}

export const trustedPlacesApi = {
  list: async (): Promise<TrustedPlace[]> => {
    const res = await apiClient.get('/api/trusted-places');
    return res.data || [];
  },

  create: async (payload: CreateTrustedPlacePayload): Promise<TrustedPlace> => {
    const res = await apiClient.post('/api/trusted-places', payload);
    return res.data;
  },

  update: async (id: string, payload: Partial<CreateTrustedPlacePayload>): Promise<TrustedPlace> => {
    const res = await apiClient.put(`/api/trusted-places/${id}`, payload);
    return res.data;
  },

  archive: async (id: string): Promise<void> => {
    await apiClient.patch(`/api/trusted-places/${id}/archive`);
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/trusted-places/${id}`);
  },
};

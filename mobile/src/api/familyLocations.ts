import { apiClient } from './client';
import { FamilyMemberLocation } from '../types';

export const familyLocationsApi = {
  getLocations: async (familyId: string): Promise<FamilyMemberLocation[]> => {
    const res = await apiClient.get(`/api/family/${familyId}/locations`);
    return res.data || [];
  },
  
  updateLocation: async (payload: { latitude: number, longitude: number, accuracy?: number, status?: string, source?: string }): Promise<void> => {
    await apiClient.put('/api/family/me/location', payload);
  },
  
  toggleSharing: async (sharingEnabled: boolean): Promise<{ sharing_enabled: boolean }> => {
    const res = await apiClient.patch('/api/family/me/location-sharing', { sharing_enabled: sharingEnabled });
    return res.data;
  }
};

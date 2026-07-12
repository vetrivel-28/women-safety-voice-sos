import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MapStyleId, DEFAULT_MAP_STYLE_ID } from '../config/MapConfig';

interface MapContextType {
  mapStyleId: MapStyleId;
  setMapStyleId: (styleId: MapStyleId) => void;
  isLoading: boolean;
}

const MapContext = createContext<MapContextType | undefined>(undefined);

const MAP_STYLE_KEY = '@safeher_map_style';

export const MapProvider = ({ children }: { children: ReactNode }) => {
  const [mapStyleId, setMapStyleIdState] = useState<MapStyleId>(DEFAULT_MAP_STYLE_ID);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedStyle = await AsyncStorage.getItem(MAP_STYLE_KEY);
        if (storedStyle) {
          setMapStyleIdState(storedStyle as MapStyleId);
        }
      } catch (e) {
        console.warn('Failed to load map settings from storage', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const setMapStyleId = async (styleId: MapStyleId) => {
    try {
      setMapStyleIdState(styleId);
      await AsyncStorage.setItem(MAP_STYLE_KEY, styleId);
    } catch (e) {
      console.warn('Failed to save map style to storage', e);
    }
  };

  return (
    <MapContext.Provider value={{ mapStyleId, setMapStyleId, isLoading }}>
      {children}
    </MapContext.Provider>
  );
};

export const useMapProvider = () => {
  const context = useContext(MapContext);
  if (context === undefined) {
    throw new Error('useMapProvider must be used within a MapProvider');
  }
  return context;
};

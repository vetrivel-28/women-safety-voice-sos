export type MapStyleId = 
  | 'OPENFREEMAP_LIBERTY'
  | 'MAPTILER_STREETS'
  | 'MAPTILER_OUTDOOR'
  | 'MAPTILER_BRIGHT'
  | 'MAPTILER_BASIC';

export interface MapStyleConfig {
  id: MapStyleId;
  name: string;
  url: string | ((apiKey: string) => string);
  requiresApiKey: boolean;
}

export const MAP_STYLES: Record<MapStyleId, MapStyleConfig> = {
  OPENFREEMAP_LIBERTY: {
    id: 'OPENFREEMAP_LIBERTY',
    name: 'Current Style (OpenFreeMap)',
    url: 'https://tiles.openfreemap.org/styles/liberty',
    requiresApiKey: false,
  },
  MAPTILER_STREETS: {
    id: 'MAPTILER_STREETS',
    name: 'MapTiler Streets',
    url: (apiKey: string) => `https://api.maptiler.com/maps/streets-v2/style.json?key=${apiKey}`,
    requiresApiKey: true,
  },
  MAPTILER_OUTDOOR: {
    id: 'MAPTILER_OUTDOOR',
    name: 'MapTiler Outdoor',
    url: (apiKey: string) => `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${apiKey}`,
    requiresApiKey: true,
  },
  MAPTILER_BRIGHT: {
    id: 'MAPTILER_BRIGHT',
    name: 'MapTiler Bright',
    url: (apiKey: string) => `https://api.maptiler.com/maps/bright-v2/style.json?key=${apiKey}`,
    requiresApiKey: true,
  },
  MAPTILER_BASIC: {
    id: 'MAPTILER_BASIC',
    name: 'MapTiler Basic',
    url: (apiKey: string) => `https://api.maptiler.com/maps/basic-v2/style.json?key=${apiKey}`,
    requiresApiKey: true,
  }
};

export const DEFAULT_MAP_STYLE_ID: MapStyleId = 'OPENFREEMAP_LIBERTY';

export const getMapStyleUrl = (styleId: MapStyleId): string => {
  const styleConfig = MAP_STYLES[styleId];
  if (!styleConfig) {
    return MAP_STYLES[DEFAULT_MAP_STYLE_ID].url as string;
  }

  if (styleConfig.requiresApiKey) {
    const apiKey = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;
    if (!apiKey) {
      console.warn(`[MapConfig] MapTiler API Key is missing. Falling back to default style.`);
      return MAP_STYLES[DEFAULT_MAP_STYLE_ID].url as string;
    }
    return (styleConfig.url as (apiKey: string) => string)(apiKey);
  }

  return styleConfig.url as string;
};

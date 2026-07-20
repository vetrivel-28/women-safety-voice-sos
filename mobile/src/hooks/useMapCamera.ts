import { useRef, useCallback, useState } from 'react';

export const DEFAULT_MAP_CENTER: [number, number] = [77.0272806, 11.0283256]; // Tamil Nadu

export function useMapCamera() {
  const cameraRef = useRef<any>(null);
  const [isUserInteraction, setIsUserInteraction] = useState(false);

  // Set the camera explicitly
  const setCenter = useCallback((lon: number, lat: number, zoom: number = 15, duration: number = 1000) => {
    try {
      console.log(`[MapCamera] setCenter called with: lon=${lon}, lat=${lat}, zoom=${zoom}, duration=${duration}`);
      if (!cameraRef.current) {
        console.warn(`[MapCamera] setCenter skipped: cameraRef is not ready`);
        return;
      }
      if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) {
        console.error(`[MapCamera] setCenter CRITICAL: Invalid coordinates passed. lon=${lon}, lat=${lat}`);
        return;
      }
      cameraRef.current.setCamera({
        centerCoordinate: [lon, lat],
        zoomLevel: zoom,
        animationDuration: duration,
        animationMode: 'flyTo'
      });
    } catch (e: any) {
      console.error('[MapCamera] setCenter Native Crash Prevented:', e);
      console.error(e?.stack);
    }
  }, []);

  // Fit bounds dynamically
  const fitBounds = useCallback((sw: [number, number], ne: [number, number], padding: number | number[] = 40, duration: number = 1000) => {
    try {
      console.log(`[MapCamera] fitBounds called with: sw=${JSON.stringify(sw)}, ne=${JSON.stringify(ne)}`);
      if (!cameraRef.current) {
        console.warn(`[MapCamera] fitBounds skipped: cameraRef is not ready`);
        return;
      }
      if (!sw || !ne || sw.length !== 2 || ne.length !== 2) {
        console.error(`[MapCamera] fitBounds CRITICAL: Invalid bounds array format.`);
        return;
      }
      if (!Number.isFinite(sw[0]) || !Number.isFinite(sw[1]) || !Number.isFinite(ne[0]) || !Number.isFinite(ne[1])) {
        console.error(`[MapCamera] fitBounds CRITICAL: Non-finite coordinates in bounds. sw=${sw}, ne=${ne}`);
        return;
      }
      const pad = typeof padding === 'number' ? [padding, padding, padding, padding] : padding;
      cameraRef.current.fitBounds(ne, sw, pad, duration);
    } catch (e: any) {
      console.error('[MapCamera] fitBounds Native Crash Prevented:', e);
      console.error(e?.stack);
    }
  }, []);

  // When user interacts with the map, we can suspend auto-centering
  const onRegionDidChange = useCallback((event: any) => {
    // If the event was caused by the user (gesture), we set a flag.
    // The event payload from MapLibre usually contains isUserInteraction
    if (event?.properties?.isUserInteraction) {
      setIsUserInteraction(true);
    }
  }, []);

  // Reset user interaction so auto-centering can resume
  const resumeAutoTracking = useCallback(() => {
    setIsUserInteraction(false);
  }, []);

  return {
    cameraRef,
    setCenter,
    fitBounds,
    isUserInteraction,
    onRegionDidChange,
    resumeAutoTracking,
    DEFAULT_MAP_CENTER
  };
}

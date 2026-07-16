import re

with open('src/screens/FamilyLiveMapScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports and SmoothMarker
new_imports = '''import { useFocusEffect } from '@react-navigation/native';
import { NearbyRespondersList } from '../components/NearbyRespondersList';
import * as Location from 'expo-location';
import { locationSharingEmitter } from '../modules/LocationSharingModule';

const SmoothMarker = React.memo(({ loc, getStatusColor }: any) => {
  const rafRef = useRef<number | null>(null);
  const previousCoords = useRef<[number, number] | null>(null);
  const lastUpdatedAt = useRef<string | null>(null);
  const [currentCoords, setCurrentCoords] = useState<[number, number]>([loc.longitude, loc.latitude]);

  useEffect(() => {
    if (loc.is_stale || (lastUpdatedAt.current && new Date(loc.updated_at) <= new Date(lastUpdatedAt.current))) {
      return;
    }
    
    const target: [number, number] = [loc.longitude, loc.latitude];
    
    if (previousCoords.current) {
      if (previousCoords.current[0] === target[0] && previousCoords.current[1] === target[1]) {
        return;
      }
      const start = previousCoords.current;
      const startTime = performance.now();
      const duration = 4500;

      const animate = (time: number) => {
        let progress = (time - startTime) / duration;
        if (progress > 1) progress = 1;
        
        const lng = start[0] + (target[0] - start[0]) * progress;
        const lat = start[1] + (target[1] - start[1]) * progress;
        
        setCurrentCoords([lng, lat]);
        
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        }
      };
      
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(animate);
    } else {
      setCurrentCoords(target);
    }
    
    previousCoords.current = target;
    lastUpdatedAt.current = loc.updated_at;
  }, [loc.longitude, loc.latitude, loc.updated_at, loc.is_stale]);
  
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!MapLibreGL) return null;

  return (
    <MapLibreGL.Marker
      id={amily-marker-}
      lngLat={currentCoords}
      anchor="center"
    >
      <View style={[styles.markerView, { backgroundColor: getStatusColor(loc.status, loc.is_stale) }]}>
        <View style={styles.markerInnerDot} />
      </View>
    </MapLibreGL.Marker>
  );
});
'''
content = content.replace(
    "import { NearbyRespondersList } from '../components/NearbyRespondersList';\nimport * as Location from 'expo-location';\nimport { startLocationSharing, stopLocationSharing, locationSharingEmitter } from '../modules/LocationSharingModule';",
    new_imports
)

# 2. State variables
content = content.replace(
    "const { family, refresh } = useFamily();\n  const [locations, setLocations] = useState<FamilyMemberLocation[]>([]);\n  const [mapZoom, setMapZoom] = useState(17);\n  const [sharingEnabled, setSharingEnabled] = useState(false);",
    "const { family, refresh, isSharingEnabled, toggleLocationSharing } = useFamily();\n  const [locations, setLocations] = useState<FamilyMemberLocation[]>([]);\n  const [mapZoom, setMapZoom] = useState(17);\n  const [cameraMode, setCameraMode] = useState<'none' | 'follow_self' | 'follow_member'>('follow_self');"
)

# 3. Refs
content = content.replace(
    "const bottomSheetRef = useRef<BottomSheet>(null);\n  const mapRef = useRef<any>(null);",
    "const bottomSheetRef = useRef<BottomSheet>(null);\n  const mapRef = useRef<any>(null);\n  const cameraRef = useRef<any>(null);\n  const didInitialCenterRef = useRef(false);\n  const followMemberIdRef = useRef<string | null>(null);"
)

# 4. 401 handler
content = content.replace(
    "setSharingEnabled(false);",
    "if (toggleLocationSharing) toggleLocationSharing(false);"
)

# 5. setSharingEnabled effect removal
content = re.sub(
    r"useEffect\(\(\) => \{\n\s*if \(myUserId && locations.length > 0\) \{\n\s*const myLoc = locations.find\(l => l.user_id === myUserId\);\n\s*if \(myLoc\) if \(toggleLocationSharing\) toggleLocationSharing\(false\)\(myLoc.sharing_enabled\);\n\s*\}\n\s*\}, \[locations, myUserId\]\);",
    "",
    content
)
# Note: wait, toggleLocationSharing replacement above replaced setSharingEnabled(false) in the original source, so the effect would be different!
# Let me use a safer regex for effect 5.
content = re.sub(r"useEffect\(\(\) => \{\n\s*if \(myUserId && locations\.length > 0\).*?\}, \[locations, myUserId\]\);", "", content, flags=re.DOTALL)


# 6. Polling interval
polling_old = '''useEffect(() => {
    if (!family) return;
    
    const intervalTime = 10000;
    
    const tick = async () => {
      if (errorMsg) return; // Back off polling on errors
      await fetchLocations();
      await fetchNearbyResponders();
      if (sharingEnabled && !errorMsg) {
        await updateMyLocation();
      }
    };

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(tick, intervalTime);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sharingEnabled, family?.id]); // Depend on family.id to restart polling on family change'''

polling_new = '''useFocusEffect(
    useCallback(() => {
      if (!family) return;
      
      const intervalTime = 5000;
      let isActive = true;
      
      const tick = async () => {
        if (!isActive || errorMsg) return;
        await fetchLocations();
        await fetchNearbyResponders();
        if (isSharingEnabled && !errorMsg) {
          await updateMyLocation();
        }
      };

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(tick, intervalTime);
      return () => {
        isActive = false;
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }, [isSharingEnabled, family?.id, errorMsg])
  );'''
content = content.replace(polling_old.replace('sharingEnabled', 'isSharingEnabled'), polling_new) # wait, sharingEnabled was not replaced in this block by my replace. 
# actually it was not replaced. I will regex substitute it.
content = re.sub(r"useEffect\(\(\) => \{\n\s*if \(\!family\) return;\n\s*const intervalTime = 10000;.*?\}, \[.*?\]\);", polling_new, content, flags=re.DOTALL)


# 7. handleToggleSharing
toggle_old = r"const handleToggleSharing = async \(val: boolean\) => \{.*?    \}\n  \};"
toggle_new = '''const handleToggleSharing = async (val: boolean) => {
    if (val) {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Foreground location permission is required first.');
        return;
      }
      Alert.alert(
        'Background Location Required',
        'SafeHer needs background location access to share your location with your family while the app is closed or the screen is locked. Please select "Allow all the time".',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Continue', 
            onPress: async () => {
              const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
              if (bgStatus !== 'granted') {
                Alert.alert('Permission Denied', 'Background location is required for this feature.');
                return;
              }
              if (toggleLocationSharing) await toggleLocationSharing(true);
              await fetchLocations();
            }
          }
        ]
      );
    } else {
      if (toggleLocationSharing) await toggleLocationSharing(false);
    }
  };'''
content = re.sub(toggle_old, toggle_new, content, flags=re.DOTALL)

# 8. Map Rendering
map_rendering_old = r"const myLoc = plottableLocs.find\(l => l.user_id === myUserId\).*?</MapComponent>"
map_rendering_new = '''const myLoc = plottableLocs.find(l => l.user_id === myUserId);
            
            let initialCenter: [number, number] = [77.0272806, 11.0283256];
            
            if (!didInitialCenterRef.current) {
               const centerLoc = myLoc || plottableLocs[0];
               if (centerLoc) {
                  initialCenter = [centerLoc.longitude!, centerLoc.latitude!];
                  didInitialCenterRef.current = true;
               }
            } else if (cameraMode === 'follow_self' && myLoc) {
               if (cameraRef.current) cameraRef.current.flyTo([myLoc.longitude!, myLoc.latitude!], 1000);
            } else if (cameraMode === 'follow_member' && followMemberIdRef.current) {
               const memberLoc = plottableLocs.find(l => l.user_id === followMemberIdRef.current);
               if (memberLoc) {
                  if (cameraRef.current) cameraRef.current.flyTo([memberLoc.longitude!, memberLoc.latitude!], 1000);
               }
            }

            const MapComponent = MapLibreGL.Map;
            const CameraComponent = MapLibreGL.Camera;
            
            return (
              <MapComponent
                ref={mapRef}
                style={StyleSheet.absoluteFillObject}
                mapStyle="https://tiles.openfreemap.org/styles/liberty"
                logo={false}
                attribution={true}
                attributionPosition={{ bottom: 8, right: 8 }}
                onRegionIsChanging={(e: any) => {
                  if (e?.nativeEvent?.userInteraction) {
                    setCameraMode('none');
                  }
                }}
              >
                <CameraComponent
                  ref={cameraRef}
                  zoom={mapZoom}
                  {...(!didInitialCenterRef.current ? { centerCoordinate: initialCenter, animationDuration: 0 } : {})}
                />
                {plottableLocs.map(loc => (
                  <SmoothMarker key={loc.user_id} loc={loc} getStatusColor={getStatusColor} />
                ))}
              </MapComponent>'''
content = re.sub(map_rendering_old, map_rendering_new, content, flags=re.DOTALL)

# 9. HandleMemberTap
tap_old = r"const handleMemberTap = useCallback\(\(member: FamilyMemberLocation\) => \{.*?bottomSheetRef\.current\?\.snapToIndex\(0\); // Collapse sheet after selection\n  \}, \[\]\);"
tap_new = '''const handleMemberTap = useCallback((member: FamilyMemberLocation) => {
    if (member.latitude && member.longitude) {
      setMapZoom(17);
      setCameraMode('follow_member');
      followMemberIdRef.current = member.user_id;
      if (cameraRef.current) {
        cameraRef.current.flyTo([member.longitude, member.latitude], 500);
      }
      console.log('[MAP] Centering on member:', member.profiles?.full_name);
    }
    bottomSheetRef.current?.snapToIndex(0); // Collapse sheet after selection
  }, []);'''
content = re.sub(tap_old, tap_new, content, flags=re.DOTALL)

# 10. Switch component usage
content = content.replace("value={sharingEnabled}", "value={!!isSharingEnabled}")
content = content.replace("thumbColor={sharingEnabled ? '#4F46E5' : '#F1F5F9'}", "thumbColor={isSharingEnabled ? '#4F46E5' : '#F1F5F9'}")
content = content.replace("sharingEnabled={sharingEnabled}", "sharingEnabled={isSharingEnabled}")

# 11. FetchLocation wait guard
content = content.replace("if (sharingEnabled && !errorMsg)", "if (isSharingEnabled && !errorMsg)")

with open('src/screens/FamilyLiveMapScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

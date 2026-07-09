import BackgroundService from 'react-native-background-actions';
import { AppState } from 'react-native';

// Phase 3: Completely disable background service to avoid Android foregroundServiceType crash
// TODO: Re-enable only after native Android foregroundServiceType is fixed for RNBackgroundActionsTask
const ENABLE_BACKGROUND_LOCATION_SERVICE = false;

const sleep = (time: number) => new Promise<void>((resolve) => setTimeout(() => resolve(), time));

const backgroundTask = async (taskDataArguments: any) => {
    const { delay } = taskDataArguments;
    await new Promise<void>(async (resolve) => {
        // Keep the JS thread alive while the service is running.
        // The actual polling logic happens in SafeWindowContext's setInterval.
        for (let i = 0; BackgroundService && typeof BackgroundService.isRunning === 'function' && BackgroundService.isRunning(); i++) {
            await sleep(delay);
        }
    });
};

const options: any = {
    taskName: 'SafeHerJourney',
    taskTitle: 'SafeHer Journey Mode is active',
    taskDesc: 'Monitoring your location for safety',
    taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
    },
    color: '#E83E8C',
    linkingURI: 'safeher://',
    parameters: {
        delay: 5000,
    },
    foregroundServiceType: ['location'],
};

export const startBackgroundLocationService = async (reason: string = 'unknown') => {
    console.log('[BG SERVICE START REQUEST] reason =', reason);
    console.log('[BG SERVICE START REQUEST] appState =', AppState.currentState);
    console.log('[BG SERVICE START REQUEST] enabled =', ENABLE_BACKGROUND_LOCATION_SERVICE);
    
    // Phase 3: Completely disable background service to avoid Android foregroundServiceType crash
    if (!ENABLE_BACKGROUND_LOCATION_SERVICE) {
        console.log('[BG SERVICE START SKIPPED] reason = phase3_background_service_disabled');
        return;
    }
    
    // Central hard guard: Phase 3 - do not start in foreground
    const currentAppState = AppState.currentState;
    
    // Guard 1: Skip if app is in foreground
    if (currentAppState === 'active') {
        console.log('[BG SERVICE START SKIPPED] reason = app_is_foreground');
        console.log('[BG SERVICE START REQUEST] allowed = false');
        return;
    }
    
    // Guard 2: Skip if app state is unknown/null at startup
    if (!currentAppState) {
        console.log('[BG SERVICE START SKIPPED] reason = app_state_unknown');
        console.log('[BG SERVICE START REQUEST] allowed = false');
        return;
    }
    
    // Guard 3: Skip for Phase 3 foreground testing - only allow explicit background transitions
    // TODO: Re-enable background service for production after Android foregroundServiceType fix
    if (reason !== 'app_background') {
        console.log('[BG SERVICE START SKIPPED] reason = phase3_foreground_only_test');
        console.log('[BG SERVICE START REQUEST] allowed = false');
        return;
    }
    
    console.log('[BG SERVICE START ALLOWED] reason =', reason);
    console.log('[BG SERVICE START REQUEST] allowed = true');
    
    try {
        if (!BackgroundService || typeof BackgroundService !== 'object' || !BackgroundService.start || !BackgroundService.isRunning) {
            console.log("Background service unavailable in Expo Go; using foreground timer.");
            return;
        }
        if (typeof BackgroundService.isRunning === 'function' && !BackgroundService.isRunning()) {
            await BackgroundService.start(backgroundTask, options);
        }
    } catch (e) {
        console.log("BackgroundService start error", e);
    }
};

export const stopBackgroundLocationService = async (reason: string = 'unknown') => {
    console.log('[BG SERVICE STOP REQUEST] reason =', reason);
    
    try {
        if (!BackgroundService || typeof BackgroundService !== 'object' || !BackgroundService.stop || !BackgroundService.isRunning) {
            return;
        }
        if (typeof BackgroundService.isRunning === 'function' && BackgroundService.isRunning()) {
            await BackgroundService.stop();
        }
    } catch (e) {
        console.log("BackgroundService stop error", e);
    }
};

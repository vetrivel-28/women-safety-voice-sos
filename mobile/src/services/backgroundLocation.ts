import BackgroundService from 'react-native-background-actions';

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

export const startBackgroundLocationService = async () => {
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

export const stopBackgroundLocationService = async () => {
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

import BackgroundService from 'react-native-background-actions';

const sleep = (time: number) => new Promise<void>((resolve) => setTimeout(() => resolve(), time));

const backgroundTask = async (taskDataArguments: any) => {
    const { delay } = taskDataArguments;
    await new Promise<void>(async (resolve) => {
        // Keep the JS thread alive while the service is running.
        // The actual polling logic happens in SafeWindowContext's setInterval.
        for (let i = 0; BackgroundService.isRunning(); i++) {
            await sleep(delay);
        }
    });
};

const options = {
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
};

export const startBackgroundLocationService = async () => {
    try {
        if (!BackgroundService.isRunning()) {
            await BackgroundService.start(backgroundTask, options);
        }
    } catch (e) {
        console.warn("BackgroundService start error", e);
    }
};

export const stopBackgroundLocationService = async () => {
    try {
        if (BackgroundService.isRunning()) {
            await BackgroundService.stop();
        }
    } catch (e) {
        console.warn("BackgroundService stop error", e);
    }
};

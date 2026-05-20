import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { AppState, Platform } from 'react-native';

const BACKGROUND_TASK = 'session-timer-task';

// Shared state accessible by background task
let _sessionStartTime: number | null = null;
let _plannedDuration: number = 0;
let _sessionType: string = 'OTHER';

const SESSION_EMOJI: Record<string, string> = {
  READING: '📖',
  WRITING: '✍️',
  CODING: '💻',
  TEST: '📝',
  OTHER: '🎯',
};

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function requestPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function showOrUpdateNotification(elapsed: number, plannedDuration: number, sessionType: string) {
  const emoji = SESSION_EMOJI[sessionType] ?? '🎯';
  const elapsedStr = formatElapsed(elapsed);
  const progress = plannedDuration > 0
    ? `${Math.round((elapsed / (plannedDuration * 60)) * 100)}% complete`
    : 'In progress';

  await Notifications.scheduleNotificationAsync({
    identifier: 'session-timer',
    content: {
      title: `${emoji} Focus Session Active`,
      body: `${elapsedStr} · ${progress}`,
      sticky: true,
      autoDismiss: false,
      data: { screen: 'session' },
    },
    trigger: null,
  });
}

async function cancelSessionNotification() {
  await Notifications.dismissNotificationAsync('session-timer');
  await Notifications.cancelScheduledNotificationAsync('session-timer');
}

// Register background task
if (!TaskManager.isTaskDefined(BACKGROUND_TASK)) {
  TaskManager.defineTask(BACKGROUND_TASK, async () => {
    if (_sessionStartTime === null) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    const elapsed = Math.floor((Date.now() - _sessionStartTime) / 1000);
    await showOrUpdateNotification(elapsed, _plannedDuration, _sessionType);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  });
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

export function useSessionNotification(
  sessionType: string,
  plannedDuration: number,
  elapsed: number,
  isActive: boolean,
) {
  const permissionGranted = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    async function setup() {
      permissionGranted.current = await requestPermissions();
      if (!permissionGranted.current) return;

      // Set shared state for background task
      startTimeRef.current = Date.now() - elapsed * 1000;
      _sessionStartTime = startTimeRef.current;
      _plannedDuration = plannedDuration;
      _sessionType = sessionType;

      // Show initial notification
      await showOrUpdateNotification(elapsed, plannedDuration, sessionType);

      // Register background fetch (fires every 10s minimum Android allows ~15min but we use foreground interval)
      await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK, {
        minimumInterval: 60,
        stopOnTerminate: true,
        startOnBoot: false,
      });
    }

    setup();

    return () => {
      // Cleanup on unmount (session ended)
      cancelSessionNotification();
      _sessionStartTime = null;
      if (intervalRef.current) clearInterval(intervalRef.current);
      BackgroundFetch.unregisterTaskAsync(BACKGROUND_TASK).catch(() => {});
    };
  }, []);

  // Foreground interval — updates every 10 seconds when app is active
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!isActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(async () => {
      if (!permissionGranted.current) return;
      const currentElapsed = startTimeRef.current
        ? Math.floor((Date.now() - startTimeRef.current) / 1000)
        : elapsed;
      _sessionStartTime = startTimeRef.current;
      await showOrUpdateNotification(currentElapsed, plannedDuration, sessionType);
    }, 10000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, sessionType, plannedDuration]);

  // Update shared state when session type or duration changes
  useEffect(() => {
    _sessionType = sessionType;
    _plannedDuration = plannedDuration;
  }, [sessionType, plannedDuration]);

  // Handle app state transitions
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const sub = AppState.addEventListener('change', (nextState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        // App came to foreground — update notification immediately
        if (startTimeRef.current && permissionGranted.current) {
          const currentElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          showOrUpdateNotification(currentElapsed, plannedDuration, sessionType);
        }
      }
      appStateRef.current = nextState;
    });

    return () => sub.remove();
  }, [sessionType, plannedDuration]);

  // Cancel notification when session is no longer active
  useEffect(() => {
    if (!isActive) {
      cancelSessionNotification();
      _sessionStartTime = null;
    }
  }, [isActive]);
}

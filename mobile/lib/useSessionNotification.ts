import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

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

// Set handler — allow notifications to show as banners when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function setupNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('session-timer', {
    name: 'Focus Session Timer',
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    vibrationPattern: null,
    enableVibrate: false,
    showBadge: false,
  });
}

async function requestPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function showOrUpdateNotification(
  elapsed: number,
  plannedDuration: number,
  sessionType: string,
) {
  if (Platform.OS !== 'android') return;
  const emoji = SESSION_EMOJI[sessionType] ?? '🎯';
  const elapsedStr = formatElapsed(elapsed);
  const progress = plannedDuration > 0
    ? `${Math.round((elapsed / (plannedDuration * 60)) * 100)}%`
    : '';

  await Notifications.scheduleNotificationAsync({
    identifier: 'session-timer',
    content: {
      title: `${emoji} Focus Session Active`,
      body: progress ? `${elapsedStr} · ${progress} complete` : elapsedStr,
      data: { screen: 'session' },
      sticky: true,
      autoDismiss: false,
    },
    trigger: null,
  });
}

export async function cancelSessionNotification() {
  if (Platform.OS !== 'android') return;
  await Notifications.dismissNotificationAsync('session-timer').catch(() => {});
  await Notifications.cancelScheduledNotificationAsync('session-timer').catch(() => {});
}

export function useSessionNotification(
  sessionType: string,
  plannedDuration: number,
  _elapsed: number,
  isActive: boolean,
  sessionStartTime?: number,
) {
  const permissionGranted = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(sessionStartTime ?? Date.now());
  const appStateRef = useRef(AppState.currentState);

  // Setup on mount
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    async function setup() {
      await setupNotificationChannel();
      permissionGranted.current = await requestPermissions();
      if (!permissionGranted.current) return;

      startTimeRef.current = sessionStartTime ?? Date.now();
      await showOrUpdateNotification(
        Math.floor((Date.now() - startTimeRef.current) / 1000),
        plannedDuration,
        sessionType,
      );
    }

    setup();

    return () => {
      cancelSessionNotification();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep sessionStartTime ref in sync
  useEffect(() => {
    if (sessionStartTime) startTimeRef.current = sessionStartTime;
  }, [sessionStartTime]);

  // Foreground ticker — every 10 seconds while active
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    if (intervalRef.current) clearInterval(intervalRef.current);

    if (!isActive) return;

    intervalRef.current = setInterval(() => {
      if (!permissionGranted.current) return;
      const currentElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      showOrUpdateNotification(currentElapsed, plannedDuration, sessionType);
    }, 10000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, sessionType, plannedDuration]);

  // AppState — update immediately when coming back to foreground
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const sub = AppState.addEventListener('change', (nextState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === 'active' &&
        isActive &&
        permissionGranted.current
      ) {
        const currentElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        showOrUpdateNotification(currentElapsed, plannedDuration, sessionType);
      }
      appStateRef.current = nextState;
    });

    return () => sub.remove();
  }, [isActive, sessionType, plannedDuration]);

  // Cancel when session ends
  useEffect(() => {
    if (!isActive) {
      cancelSessionNotification();
    }
  }, [isActive]);
}

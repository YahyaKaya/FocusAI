import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import { useSessionContext } from '../lib/SessionContext';
import { useTheme } from '../lib/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const SESSION_EMOJI: Record<string, string> = {
  READING: '📖', WRITING: '✍️', CODING: '💻', TEST: '📝', OTHER: '🎯',
};

export function SessionBanner() {
  const { t } = useTranslation();
  const colors = useTheme();
  const router = useRouter();
  const { activeSessionId, activeSessionType, activeSessionStart, pendingPostSurveyId } = useSessionContext();
  const pathname = usePathname();
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (activeSessionId && activeSessionStart) {
      const tick = () => setElapsed(Math.floor((Date.now() - activeSessionStart) / 1000));
      tick();
      intervalRef.current = setInterval(tick, 1000);
    } else {
      setElapsed(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [activeSessionId, activeSessionStart]);

  if (!activeSessionId && !pendingPostSurveyId) return null;
  if (pathname.includes('/session') && !pathname.includes('post-survey')) return null;

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const emoji = SESSION_EMOJI[activeSessionType] ?? '🎯';

  function handlePress() {
    if (activeSessionId) {
      router.push(`/(app)/session?id=${activeSessionId}&sessionType=${activeSessionType}`);
    } else if (pendingPostSurveyId) {
      router.push(`/(app)/post-survey?id=${pendingPostSurveyId}&sessionType=OTHER`);
    }
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      style={{
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 4,
        borderRadius: 14,
        backgroundColor: activeSessionId ? colors.primary : colors.scoreAmber ?? '#f59e0b',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 10,
      }}
    >
      <Text style={{ fontSize: 18 }}>{activeSessionId ? emoji : '⚠️'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: activeSessionId ? colors.onPrimary : '#fff', fontWeight: '700', fontSize: 14 }}>
          {activeSessionId
            ? t('session.active_banner_title')
            : t('session.pending_survey_title')}
        </Text>
        <Text style={{ color: activeSessionId ? colors.onPrimary : '#fff', fontSize: 12, opacity: 0.85 }}>
          {activeSessionId
            ? `${timeStr} · ${t('session.tap_to_return')}`
            : t('session.tap_to_complete')}
        </Text>
      </View>
      <MaterialCommunityIcons
        name="arrow-right"
        size={20}
        color={activeSessionId ? colors.onPrimary : '#fff'}
      />
    </TouchableOpacity>
  );
}

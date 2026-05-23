import { View, Text, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Slider from '@react-native-community/slider';
import { api } from "../../lib/api";
import { useTheme } from "../../lib/ThemeContext";
import { useSessionContext } from '../../lib/SessionContext';

function EmojiSliderRow({ label, value, onChange, emojis, colors }: {
  label: string; value: number; onChange: (v: number) => void; emojis: string[]; colors: any;
}) {
  const emojiIndex = Math.floor(value) - 1;
  const safeIndex = Math.min(Math.max(emojiIndex, 0), emojis.length - 1);

  return (
    <View style={{ marginBottom: 32 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onSurface }}>{label}</Text>
        <Text style={{ fontSize: 28 }}>{emojis[safeIndex]}</Text>
      </View>
      <Slider
        style={{ width: '100%', height: 40 }}
        minimumValue={1}
        maximumValue={5}
        step={0.5}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.surfaceContainerHigh}
        thumbTintColor={colors.primary}
      />
      <Text style={{
        textAlign: 'center',
        fontSize: 12,
        fontWeight: '700',
        color: colors.primary,
        marginTop: 4,
      }}>{value}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 8 }}>
        <Text style={{ fontSize: 11, color: colors.onSurfaceVariant }}>1</Text>
        <Text style={{ fontSize: 11, color: colors.onSurfaceVariant }}>5</Text>
      </View>
    </View>
  );
}

export default function QuickStartScreen() {
  const { t } = useTranslation();
  const colors = useTheme();
  const router = useRouter();
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [loading, setLoading] = useState(false);
  const [sessionType, setSessionType] = useState<string>('OTHER');
  const [plannedDuration, setPlannedDuration] = useState<number>(45);
  const [environment, setEnvironment] = useState<string>('QUIET');
  const [musicType, setMusicType] = useState<string | null>(null);
  const [recId, setRecId] = useState<string | null>(null);
  const [recLoading, setRecLoading] = useState(true);
  const { startSession } = useSessionContext();

  useEffect(() => {
    setRecLoading(true);
    api.get<{ recommendation: any }>('/recommendations/latest')
      .then(({ recommendation }) => {
        if (!recommendation?.reasoning) return;
        const parsed = JSON.parse(recommendation.reasoning);
        const s = parsed.suggested_settings;
        if (!s) return;
        if (s.session_type) setSessionType(s.session_type);
        if (s.duration_minutes) setPlannedDuration(s.duration_minutes);
        if (s.environment) setEnvironment(s.environment);
        if (s.music_type) setMusicType(s.music_type);
        setRecId(recommendation.id);
      })
      .catch(() => {})
      .finally(() => setRecLoading(false));
  }, []);

  async function handleStart() {
    setLoading(true);
    try {
      const { session } = await api.post<{ session: { id: string } }>('/sessions', {
        session_type: sessionType,
        planned_duration: plannedDuration,
      });
      await api.post(`/sessions/${session.id}/pre-survey`, {
        mood,
        energy,
        motivation: 3,
        goal_difficulty: 3,
        environment,
        music_type: musicType,
      });
      if (recId) {
        api.patch(`/recommendations/${recId}`, { interaction: 'APPLIED' }).catch(() => {});
      }
      startSession(session.id, sessionType);
      router.push(`/(app)/session?id=${session.id}&sessionType=${sessionType}&plannedDuration=${plannedDuration}`);
    } catch {
      Alert.alert(t('common.error'), t('common.error_retry'));
    }
    setLoading(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, height: 64 }}>
        <TouchableOpacity
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.surfaceContainerLow }}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={{ color: colors.onSurface, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.onSurface }}>{t('home.start_session')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 16 }}>
        {/* AI Badge */}
        <View style={{ flexDirection: 'row', alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.tertiaryContainer, marginBottom: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onTertiaryContainer }}>🤖 {t('home.ai_recommendation')}</Text>
        </View>
        <Text style={{ fontSize: 14, color: colors.onSurfaceVariant, marginBottom: 40, lineHeight: 20 }}>
          {t('quick_start.subtitle')}
        </Text>

        {/* Just 2 sliders */}
        <EmojiSliderRow
          label={t('pre_survey.mood')}
          value={mood}
          onChange={setMood}
          emojis={['😴', '😔', '😐', '🙂', '😄']}
          colors={colors}
        />
        <EmojiSliderRow
          label={t('pre_survey.energy')}
          value={energy}
          onChange={setEnergy}
          emojis={['😴', '😔', '😐', '🙂', '😄']}
          colors={colors}
        />

        <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginBottom: 16, fontStyle: 'italic' }}>
          {t('quick_start.ai_note')}
        </Text>

        {!recLoading && (sessionType !== 'OTHER' || plannedDuration !== 45) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.tertiaryContainer }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.onTertiaryContainer }}>⏱ {plannedDuration} min</Text>
            </View>
            <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.tertiaryContainer }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.onTertiaryContainer }}>
                {sessionType === 'READING' ? '📖' : sessionType === 'CODING' ? '💻' : sessionType === 'WRITING' ? '✍️' : sessionType === 'TEST' ? '📝' : '🎯'} {sessionType.toLowerCase()}
              </Text>
            </View>
            {environment !== 'QUIET' && (
              <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.tertiaryContainer }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.onTertiaryContainer }}>
                  {environment === 'MUSIC' ? '🎵' : '🔊'} {environment.toLowerCase()}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* CTA */}
        <TouchableOpacity
          style={{ height: 56, borderRadius: 999, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}
          onPress={handleStart}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 18 }}>
            {loading ? t('common.loading') : t('pre_survey.start')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

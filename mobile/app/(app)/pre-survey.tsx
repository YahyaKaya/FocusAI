import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
} from "react-native";
import Slider from '@react-native-community/slider';
import { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useTheme } from "../../lib/ThemeContext";
import { useSessionContext } from '../../lib/SessionContext';

function EmojiSliderRow({
  label,
  value,
  onChange,
  emojis,
  colors,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  emojis: string[];
  colors: any;
}) {
  const emojiIndex = Math.floor(value) - 1;
  const safeIndex = Math.min(Math.max(emojiIndex, 0), emojis.length - 1);

  return (
    <View className="mb-10">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-base font-bold text-on-surface dark:text-[#e8f0eb]">{label}</Text>
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
      <View className="flex-row justify-between px-1 mt-2">
        <Text className="text-xs text-on-surface-variant dark:text-[#9ab0a0]">1</Text>
        <Text className="text-xs text-on-surface-variant dark:text-[#9ab0a0]">5</Text>
      </View>
    </View>
  );
}

export default function PreSurveyScreen() {
  const { t } = useTranslation();
  const colors = useTheme();
  const router = useRouter();
  const { custom, session_type, planned_duration, environment: envParam, music_type, rec_id } = useLocalSearchParams<{
    custom?: string;
    session_type?: string;
    planned_duration?: string;
    environment?: string;
    music_type?: string;
    rec_id?: string;
  }>();
  const isCustom = custom === "true";
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [motivation, setMotivation] = useState(3);
  const [goalDifficulty, setGoalDifficulty] = useState(3);
  const [environment, setEnvironment] = useState<"QUIET" | "NOISY" | "MUSIC">(
    (envParam as any) ?? "QUIET"
  );
  const [sessionType, setSessionType] = useState<"READING" | "WRITING" | "CODING" | "TEST" | "OTHER">(
    (session_type as any) ?? "OTHER"
  );
  const [plannedDuration, setPlannedDuration] = useState(planned_duration ?? "45");
  const [loading, setLoading] = useState(false);
  const { startSession } = useSessionContext();
  const [musicType, setMusicType] = useState<string | null>(music_type ?? null);
  const [showTypePicker, setShowTypePicker] = useState(false);

  const SESSION_TYPES = [
    { key: 'READING', emoji: '📖', label: t('session_types.READING') },
    { key: 'WRITING', emoji: '✍️', label: t('session_types.WRITING') },
    { key: 'CODING', emoji: '💻', label: t('session_types.CODING') },
    { key: 'TEST', emoji: '📝', label: t('session_types.TEST') },
    { key: 'OTHER', emoji: '🎯', label: t('session_types.OTHER') },
  ];

  async function handleStart() {
    setLoading(true);
    try {
      const { session } = await api.post<{ session: { id: string } }>(
        "/sessions",
        {
          session_type: sessionType,
          planned_duration: parseInt(plannedDuration) || 45,
        },
      );
      await api.post(`/sessions/${session.id}/pre-survey`, {
        mood,
        energy,
        motivation,
        goal_difficulty: goalDifficulty,
        environment,
        music_type: environment === 'MUSIC' ? musicType : null,
      });
      startSession(session.id, sessionType);
      router.push(`/(app)/session?id=${session.id}&sessionType=${sessionType}&plannedDuration=${parseInt(plannedDuration) || 45}`);
      if (rec_id) {
        api.patch(`/recommendations/${rec_id}`, { interaction: 'APPLIED' }).catch(() => {});
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  const musicOptions: { key: string; label: string }[] = [
    { key: 'AMBIENT', label: t('pre_survey.music_ambient') },
    { key: 'LOFI', label: t('pre_survey.music_lofi') },
    { key: 'CLASSICAL', label: t('pre_survey.music_classical') },
    { key: 'OTHER', label: t('pre_survey.music_other') },
  ];

  const envOptions: { key: typeof environment; label: string }[] = [
    { key: "QUIET", label: t("pre_survey.quiet") },
    { key: "NOISY", label: t("pre_survey.noisy") },
    { key: "MUSIC", label: t("pre_survey.music") },
  ];

  return (
    <ScrollView
      className="flex-1 bg-surface dark:bg-[#0f1a14]"
      contentContainerClassName="pb-12"
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 h-16 bg-surface dark:bg-[#0f1a14]">
        <TouchableOpacity
          className="w-10 h-10 items-center justify-center rounded-full bg-surface-container-low dark:bg-[#1e2d24]"
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text className="text-on-surface dark:text-[#e8f0eb] text-lg">←</Text>
        </TouchableOpacity>
        <Text className="text-lg font-bold text-on-surface dark:text-[#e8f0eb]">
          {isCustom ? t("pre_survey.custom_session") : t("pre_survey.title")}
        </Text>
        <View className="w-10" />
      </View>

      <View className="px-6 pt-4">
        {/* Intro Section */}
        <View className="mb-10">
          <View className="flex-row items-center self-start px-4 py-2 rounded-full bg-tertiary-container dark:bg-[#2a3318] mb-4">
            <Text className="text-sm font-semibold text-on-tertiary-container dark:text-[#c8d89a]">
              {t("pre_survey.alignment_mode")}
            </Text>
          </View>
          <Text className="text-on-surface-variant dark:text-[#9ab0a0] leading-relaxed max-w-xs">
            {t("pre_survey.subtitle")}
          </Text>
        </View>

        {/* Sliders */}
        <EmojiSliderRow label={t("pre_survey.mood")} value={mood} onChange={setMood} emojis={['😴', '😔', '😐', '🙂', '😄']} colors={colors} />
        <EmojiSliderRow label={t("pre_survey.energy")} value={energy} onChange={setEnergy} emojis={['😴', '😔', '😐', '🙂', '😄']} colors={colors} />
        <EmojiSliderRow label={t("pre_survey.motivation")} value={motivation} onChange={setMotivation} emojis={['😴', '😔', '😐', '🙂', '😄']} colors={colors} />
        <EmojiSliderRow
          label={t("pre_survey.goal_difficulty")}
          value={goalDifficulty}
          onChange={setGoalDifficulty}
          emojis={['😌', '🤔', '😤', '😰', '🤯']}
          colors={colors}
        />

        {/* Study Type */}
        <View className="mb-10">
          <Text className="text-base font-bold text-on-surface dark:text-[#e8f0eb] mb-4">
            {t("pre_survey.session_type")}
          </Text>
          <TouchableOpacity
            className="flex-row items-center justify-between px-5 py-4 rounded-xl bg-surface-container-lowest dark:bg-[#0a1510]"
            style={{ borderWidth: 1, borderColor: colors.outlineVariantBorder }}
            onPress={() => setShowTypePicker(true)}
            activeOpacity={0.7}
          >
            <Text className="text-on-surface dark:text-[#e8f0eb] font-semibold">
              {SESSION_TYPES.find(s => s.key === sessionType)?.emoji} {SESSION_TYPES.find(s => s.key === sessionType)?.label}
            </Text>
            <Text className="text-on-surface-variant dark:text-[#9ab0a0] text-lg">›</Text>
          </TouchableOpacity>

          <Modal visible={showTypePicker} transparent animationType="slide" onRequestClose={() => setShowTypePicker(false)}>
            <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowTypePicker(false)}>
              <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.onSurface, marginBottom: 20 }}>{t('pre_survey.session_type')}</Text>
                {SESSION_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type.key}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.surfaceContainer }}
                    onPress={() => { setSessionType(type.key as any); setShowTypePicker(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 16, color: sessionType === type.key ? colors.primary : colors.onSurface, fontWeight: sessionType === type.key ? '700' : '400' }}>
                      {type.emoji} {type.label}
                    </Text>
                    {sessionType === type.key && <Text style={{ color: colors.primary }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>
        </View>

        {/* Environment */}
        <View className="mb-10">
          <Text className="text-base font-bold text-on-surface dark:text-[#e8f0eb] mb-4">
            {t("pre_survey.environment")}
          </Text>
          <View className="flex-row gap-2">
            {envOptions.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                className={`flex-1 h-12 rounded-xl items-center justify-center border-2 ${
                  environment === opt.key
                    ? "bg-primary-container dark:bg-[#1a3d2a] border-primary-dim dark:border-[#36c46a]"
                    : "bg-surface-container-low dark:bg-[#1e2d24] border-transparent"
                }`}
                onPress={() => setEnvironment(opt.key)}
                activeOpacity={0.7}
              >
                <Text
                  className={`text-xs font-bold ${
                    environment === opt.key
                      ? "text-on-primary-container dark:text-[#a3e2c0]"
                      : "text-on-surface-variant dark:text-[#9ab0a0]"
                  }`}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Music Type — only show when environment is MUSIC */}
        {environment === 'MUSIC' && (
          <View className="mb-10">
            <Text className="text-base font-bold text-on-surface dark:text-[#e8f0eb] mb-4">
              {t('pre_survey.music_type')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {musicOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  className={`h-12 px-4 rounded-xl items-center justify-center border-2 ${
                    musicType === opt.key
                      ? 'bg-primary-container dark:bg-[#1a3d2a] border-primary-dim dark:border-[#36c46a]'
                      : 'bg-surface-container-low dark:bg-[#1e2d24] border-transparent'
                  }`}
                  onPress={() => setMusicType(opt.key)}
                  activeOpacity={0.7}
                >
                  <Text
                    className={`text-xs font-bold ${
                      musicType === opt.key
                        ? 'text-on-primary-container dark:text-[#a3e2c0]'
                        : 'text-on-surface-variant dark:text-[#9ab0a0]'
                    }`}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Planned Duration */}
        <View className="mb-12">
          <Text className="text-base font-bold text-on-surface dark:text-[#e8f0eb] mb-4">
            {t("pre_survey.planned_duration")}
          </Text>
          <TextInput
            className="h-14 px-5 rounded-xl bg-surface-container-lowest dark:bg-[#0a1510] text-on-surface dark:text-[#e8f0eb] text-sm"
            value={plannedDuration}
            onChangeText={setPlannedDuration}
            keyboardType="numeric"
            placeholder={t("pre_survey.duration_placeholder")}
            placeholderTextColor={colors.outlineVariant}
            style={{ borderWidth: 1, borderColor: colors.outlineVariantBorder }}
          />
        </View>

        {/* Start Session CTA */}
        <TouchableOpacity
          className="h-14 w-full rounded-full bg-primary dark:bg-[#4ade80] items-center justify-center flex-row gap-2 mb-4"
          onPress={handleStart}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text className="text-on-primary dark:text-[#0a1f12] font-bold text-lg">
            {loading ? t("common.loading") : t("pre_survey.start")}
          </Text>
          {!loading && <Text className="text-on-primary dark:text-[#0a1f12] text-xl">▶</Text>}
        </TouchableOpacity>

        <Text className="text-center text-xs text-outline dark:text-[#4a5a52] uppercase tracking-widest">
          {t("pre_survey.calibrating")}
        </Text>
      </View>
    </ScrollView>
  );
}

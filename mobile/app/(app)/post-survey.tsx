import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
} from "react-native";
import Slider from '@react-native-community/slider';
import { useState, useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useTheme } from "../../lib/ThemeContext";
import { useSessionContext } from '../../lib/SessionContext';
import { cancelSessionNotification } from '../../lib/useSessionNotification';

async function waitForScore(sessionId: string, maxAttempts = 10): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const data = await api.get<{ session: { productivity_score: number | null } }>(`/sessions/${sessionId}`);
    if (data.session.productivity_score !== null) return;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
}

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

export default function PostSurveyScreen() {
  const { t } = useTranslation();
  const colors = useTheme();
  const { id, sessionType: initialType, elapsed: elapsedParam } = useLocalSearchParams<{ id: string; sessionType?: string; elapsed?: string }>();
  const router = useRouter();
  const [productivity, setProductivity] = useState(3);
  const [focus, setFocus] = useState(3);
  const [satisfaction, setSatisfaction] = useState(3);
  const [distraction, setDistraction] = useState<"NONE" | "FEW" | "MANY">(
    "NONE",
  );
  const [notes, setNotes] = useState("");
  const [sessionType, setSessionType] = useState<string>(initialType ?? 'OTHER');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [testCorrect, setTestCorrect] = useState('');
  const [testTotal, setTestTotal] = useState('');
  const { clearPendingPostSurvey } = useSessionContext();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    cancelSessionNotification();
  }, []);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const SESSION_TYPES = [
    { key: 'READING', emoji: '📖', label: t('session_types.READING') },
    { key: 'WRITING', emoji: '✍️', label: t('session_types.WRITING') },
    { key: 'CODING', emoji: '💻', label: t('session_types.CODING') },
    { key: 'TEST', emoji: '📝', label: t('session_types.TEST') },
    { key: 'OTHER', emoji: '🎯', label: t('session_types.OTHER') },
  ];

  async function handleSubmit() {
    setLoading(true);
    setSubmitError(null);
    try {
      await api.patch(`/sessions/${id}/type`, { session_type: sessionType });
      let finalProductivity = productivity;
      if (sessionType === 'TEST' && testTotal && testCorrect) {
        const total = parseFloat(testTotal);
        const correct = parseFloat(testCorrect);
        if (correct > total) {
          setSubmitError(t('post_survey.test_score_invalid'));
          setLoading(false);
          return;
        }
        if (total > 0) {
          finalProductivity = Math.min(5, Math.max(1, (correct / total) * 4 + 1));
          finalProductivity = Math.round(finalProductivity * 2) / 2; // round to nearest 0.5
        }
      }
      await api.post<{ productivity_score: number }>(
        `/sessions/${id}/post-survey`,
        {
          productivity: finalProductivity,
          focus,
          satisfaction,
          distraction,
          notes: notes || null,
        },
      );
      await waitForScore(id);
      clearPendingPostSurvey();
      router.push(`/(app)/insights?id=${id}`);
    } catch (e) {
      console.error(e);
      setSubmitError(t("common.error_retry"));
    }
    setLoading(false);
  }

  const distractionOptions: { key: typeof distraction; label: string }[] = [
    { key: "NONE", label: t("post_survey.none") },
    { key: "FEW", label: t("post_survey.few") },
    { key: "MANY", label: t("post_survey.many") },
  ];

  return (
    <ScrollView
      className="flex-1 bg-surface dark:bg-[#0f1a14]"
      contentContainerClassName="pb-12"
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 h-16 bg-surface dark:bg-[#0f1a14]">
        <View className="w-10" />
        <Text className="text-lg font-bold text-on-surface dark:text-[#e8f0eb]">
          {t("post_survey.header_title")}
        </Text>
        <View className="w-10" />
      </View>

      <View className="px-6 pt-4">
        {/* Intro */}
        <View className="mb-10">
          <View className="flex-row items-center self-start px-4 py-2 rounded-full bg-tertiary-container dark:bg-[#2a3318] mb-4">
            <Text className="text-sm font-semibold text-on-tertiary-container dark:text-[#c8d89a]">
              {t("post_survey.badge")}
            </Text>
          </View>
          <Text className="text-2xl font-extrabold text-on-surface dark:text-[#e8f0eb] tracking-tight mb-2">
            {t("post_survey.title")}
          </Text>
          <Text className="text-on-surface-variant dark:text-[#9ab0a0] leading-relaxed max-w-xs">
            {t("post_survey.subtitle")}
          </Text>
        </View>

        {elapsedParam && parseInt(elapsedParam) > 0 && (
          <View className="flex-row items-center gap-3 mb-10 px-4 py-3 rounded-xl bg-surface-container-low dark:bg-[#1e2d24]">
            <Text style={{ fontSize: 24 }}>⏱</Text>
            <View>
              <Text className="text-xs font-semibold text-on-surface-variant dark:text-[#9ab0a0] uppercase tracking-wide">{t('post_survey.session_duration')}</Text>
              <Text className="text-lg font-bold text-on-surface dark:text-[#e8f0eb]">
                {Math.floor(parseInt(elapsedParam) / 60)}m {parseInt(elapsedParam) % 60}s
              </Text>
            </View>
          </View>
        )}

        {/* Session Type */}
        <View className="mb-10">
          <Text className="text-base font-bold text-on-surface dark:text-[#e8f0eb] mb-4">
            {t('session.session_type')}
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
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.onSurface, marginBottom: 20 }}>{t('session.change_type')}</Text>
                {SESSION_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type.key}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.surfaceContainer }}
                    onPress={() => { setSessionType(type.key); setShowTypePicker(false); }}
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

        {/* Sliders */}
        {sessionType === 'TEST' ? (
          <View className="mb-10">
            <Text className="text-base font-bold text-on-surface dark:text-[#e8f0eb] mb-4">
              {t('post_survey.test_score')}
            </Text>
            <View className="flex-row items-center gap-3">
              <TextInput
                className="flex-1 h-14 px-5 rounded-xl bg-surface-container-lowest dark:bg-[#0a1510] text-on-surface dark:text-[#e8f0eb] text-sm"
                value={testCorrect}
                onChangeText={setTestCorrect}
                keyboardType="numeric"
                placeholder={t('post_survey.test_correct')}
                placeholderTextColor={colors.outlineVariant}
                style={{ borderWidth: 1, borderColor: colors.outlineVariantBorder }}
              />
              <Text className="text-on-surface-variant dark:text-[#9ab0a0] text-lg font-bold">/</Text>
              <TextInput
                className="flex-1 h-14 px-5 rounded-xl bg-surface-container-lowest dark:bg-[#0a1510] text-on-surface dark:text-[#e8f0eb] text-sm"
                value={testTotal}
                onChangeText={setTestTotal}
                keyboardType="numeric"
                placeholder={t('post_survey.test_total')}
                placeholderTextColor={colors.outlineVariant}
                style={{ borderWidth: 1, borderColor: colors.outlineVariantBorder }}
              />
            </View>
            {testCorrect && testTotal && parseFloat(testTotal) > 0 && (
              <Text className="text-xs text-on-surface-variant dark:text-[#9ab0a0] mt-2">
                {Math.round((parseFloat(testCorrect) / parseFloat(testTotal)) * 100)}% → {t('post_survey.productivity_score')}: {Math.round(Math.min(5, Math.max(1, (parseFloat(testCorrect) / parseFloat(testTotal)) * 4 + 1)) * 2) / 2}/5
              </Text>
            )}
          </View>
        ) : (
          <EmojiSliderRow
            label={t("post_survey.productivity")}
            value={productivity}
            onChange={setProductivity}
            emojis={['😞', '😕', '😐', '🙂', '🚀']}
            colors={colors}
          />
        )}
        <EmojiSliderRow
          label={t("post_survey.focus")}
          value={focus}
          onChange={setFocus}
          emojis={['😞', '😕', '😐', '🙂', '🚀']}
          colors={colors}
        />
        <EmojiSliderRow
          label={t("post_survey.satisfaction")}
          value={satisfaction}
          onChange={setSatisfaction}
          emojis={['😞', '😕', '😐', '🙂', '🚀']}
          colors={colors}
        />

        {/* Distraction Level */}
        <View className="mb-10">
          <Text className="text-base font-bold text-on-surface dark:text-[#e8f0eb] mb-4">
            {t("post_survey.distraction")}
          </Text>
          <View className="flex-row gap-2">
            {distractionOptions.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                className={`flex-1 h-12 rounded-xl items-center justify-center border-2 ${
                  distraction === opt.key
                    ? "bg-primary-container dark:bg-[#1a3d2a] border-primary-dim dark:border-[#36c46a]"
                    : "bg-surface-container-low dark:bg-[#1e2d24] border-transparent"
                }`}
                onPress={() => setDistraction(opt.key)}
                activeOpacity={0.7}
              >
                <Text
                  className={`text-xs font-bold ${
                    distraction === opt.key
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

        {/* Notes */}
        <View className="mb-12">
          <Text className="text-base font-bold text-on-surface dark:text-[#e8f0eb] mb-4">
            {t("post_survey.notes")}
          </Text>
          <TextInput
            className="bg-surface-container-lowest dark:bg-[#0a1510] rounded-xl px-5 py-4 text-on-surface dark:text-[#e8f0eb] text-sm"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            placeholder={t("post_survey.notes_placeholder")}
            placeholderTextColor={colors.outlineVariant}
            style={{
              minHeight: 96,
              textAlignVertical: "top",
              borderWidth: 1,
              borderColor: colors.outlineVariantBorder,
            }}
          />
        </View>

        {/* Error message */}
        {submitError && (
          <Text className="text-error dark:text-[#ff8a80] text-sm text-center mb-3">
            {submitError}
          </Text>
        )}

        {/* Submit CTA */}
        <TouchableOpacity
          className="h-14 w-full rounded-full bg-primary dark:bg-[#4ade80] items-center justify-center flex-row gap-2 mb-4"
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text className="text-on-primary dark:text-[#0a1f12] font-bold text-lg">
            {loading ? t("common.loading") : t("post_survey.submit")}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

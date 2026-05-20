import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/ThemeContext";
import type { AppColors } from "../../lib/theme";
import { api } from "../../lib/api";
import i18n from '../../lib/i18n';

type FullSession = {
  id: string;
  session_type: string;
  status: string;
  start_time: string;
  end_time: string | null;
  actual_duration: number | null;
  planned_duration: number | null;
  pause_count: number;
  total_break_mins: number;
  productivity_score: number | null;
  pre_survey: {
    mood: number;
    energy: number;
    motivation: number;
    goal_difficulty: number;
    environment: string;
  } | null;
  post_survey: {
    productivity: number;
    focus: number;
    satisfaction: number;
    distraction: string;
    notes: string | null;
  } | null;
};

const SESSION_EMOJI: Record<string, string> = {
  READING: '📖', WRITING: '✍️', CODING: '💻', TEST: '📝', OTHER: '🎯',
};

const MOOD_EMOJI = ['😴', '😔', '😐', '🙂', '😄'];
const GOAL_EMOJI = ['😌', '🤔', '😤', '😰', '🤯'];
const POST_EMOJI = ['😞', '😕', '😐', '🙂', '🚀'];

function scoreColor(score: number | null, colors: AppColors): string {
  if (score === null) return colors.onSurfaceVariant;
  if (score >= 70) return colors.primary;
  if (score >= 50) return colors.scoreAmber;
  return colors.scoreRed;
}

function scoreBgColor(score: number | null, colors: AppColors): string {
  if (score === null) return colors.surfaceContainer;
  if (score >= 70) return colors.primaryContainer;
  if (score >= 50) return colors.scoreAmberBg;
  return colors.scoreRedBg;
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 24, height: 64,
    },
    backBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: colors.surfaceContainerLow,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: colors.onSurface },
    content: { paddingHorizontal: 24, paddingBottom: 48 },
    heroCard: {
      borderRadius: 20, padding: 24, marginBottom: 24,
      backgroundColor: colors.primary,
    },
    heroEmoji: { fontSize: 40, marginBottom: 12 },
    heroType: { fontSize: 24, fontWeight: '800', color: colors.onPrimary, marginBottom: 4 },
    heroDate: { fontSize: 13, color: colors.onPrimary, opacity: 0.7 },
    scoreCircle: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: colors.overlayLight,
      alignItems: 'center', justifyContent: 'center',
    },
    scoreText: { fontSize: 28, fontWeight: '800', color: colors.primary },
    scoreLabel: { fontSize: 10, fontWeight: '700', color: colors.onSurfaceVariant, letterSpacing: 1 },
    sectionTitle: {
      fontSize: 16, fontWeight: '700', color: colors.onSurface,
      marginBottom: 12, marginTop: 8,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16, padding: 20, marginBottom: 16,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.surfaceContainer },
    rowLast: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
    rowLabel: { fontSize: 14, color: colors.onSurfaceVariant },
    rowValue: { fontSize: 14, fontWeight: '600', color: colors.onSurface },
    emojiRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    emojiVal: { fontSize: 22 },
    notesBox: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 12, padding: 16, marginTop: 8,
    },
    notesText: { fontSize: 14, color: colors.onSurface, lineHeight: 22 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    distractionPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  });
}

export default function SessionDetailScreen() {
  const { t } = useTranslation();
  const colors = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<FullSession | null>(null);
  const [loading, setLoading] = useState(true);
  const ss = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    api.get<{ session: FullSession }>(`/sessions/${id}`)
      .then(data => setSession(data.session))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={ss.root}>
        <StatusBar style={colors.statusBarStyle} />
        <View style={ss.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={ss.root}>
        <StatusBar style={colors.statusBarStyle} />
        <View style={ss.centered}>
          <Text style={{ color: colors.error }}>{t('common.error')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pre = session.pre_survey;
  const post = session.post_survey;
  const score = session.productivity_score;

  const startDate = new Date(session.start_time);
  const locale = i18n.language === 'tr' ? 'tr-TR' : 'en-US';
  const dateStr = startDate.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = startDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  const distractionColors: Record<string, { bg: string; text: string }> = {
    NONE: { bg: colors.tertiaryContainer, text: colors.onTertiaryContainer },
    FEW: { bg: colors.surfaceContainer, text: colors.onSurfaceVariant },
    MANY: { bg: colors.scoreRedBg, text: colors.error },
  };
  const distractionLabels: Record<string, string> = {
    NONE: t('insights.distraction_none'),
    FEW: t('insights.distraction_few'),
    MANY: t('insights.distraction_many'),
  };

  return (
    <SafeAreaView style={ss.root}>
      <StatusBar style={colors.statusBarStyle} />

      {/* Header */}
      <View style={ss.header}>
        <TouchableOpacity style={ss.backBtn} onPress={() => router.push('/(app)/history')} activeOpacity={0.7}>
          <Text style={{ color: colors.onSurface, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={ss.headerTitle}>{t('history.session_detail')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={ss.content} showsVerticalScrollIndicator={false}>

        {/* Hero Card */}
        <View style={ss.heroCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={ss.heroEmoji}>{SESSION_EMOJI[session.session_type] ?? '🎯'}</Text>
              <Text style={ss.heroType}>{t(`session_types.${session.session_type}`)}</Text>
              <Text style={ss.heroDate}>{dateStr} · {timeStr}</Text>
            </View>
            {score !== null && (
              <View style={{ alignItems: 'center' }}>
                <View style={ss.scoreCircle}>
                  <Text style={ss.scoreText}>{score}</Text>
                </View>
                <Text style={[ss.scoreLabel, { marginTop: 6, color: colors.onPrimary, opacity: 0.7 }]}>
                  {t('insights.productivity_score')}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Session Stats */}
        <Text style={ss.sectionTitle}>{t('history.session_stats')}</Text>
        <View style={ss.card}>
          <View style={ss.row}>
            <Text style={ss.rowLabel}>{t('history.duration_label')}</Text>
            <Text style={ss.rowValue}>{session.actual_duration ?? '—'} {t('history.mins')}</Text>
          </View>
          <View style={ss.row}>
            <Text style={ss.rowLabel}>{t('history.planned_duration')}</Text>
            <Text style={ss.rowValue}>{session.planned_duration ?? '—'} {t('history.mins')}</Text>
          </View>
          <View style={ss.row}>
            <Text style={ss.rowLabel}>{t('history.pauses')}</Text>
            <Text style={ss.rowValue}>{session.pause_count ?? 0}</Text>
          </View>
          <View style={ss.rowLast}>
            <Text style={ss.rowLabel}>{t('history.break_time')}</Text>
            <Text style={ss.rowValue}>{session.total_break_mins ?? 0} {t('history.mins')}</Text>
          </View>
        </View>

        {/* Pre-Survey */}
        {pre && (
          <>
            <Text style={ss.sectionTitle}>{t('history.pre_survey_title')}</Text>
            <View style={ss.card}>
              <View style={ss.row}>
                <Text style={ss.rowLabel}>{t('pre_survey.mood')}</Text>
                <View style={ss.emojiRow}>
                  <Text style={ss.emojiVal}>{MOOD_EMOJI[pre.mood - 1]}</Text>
                  <Text style={ss.rowValue}>{pre.mood}/5</Text>
                </View>
              </View>
              <View style={ss.row}>
                <Text style={ss.rowLabel}>{t('pre_survey.energy')}</Text>
                <View style={ss.emojiRow}>
                  <Text style={ss.emojiVal}>{MOOD_EMOJI[pre.energy - 1]}</Text>
                  <Text style={ss.rowValue}>{pre.energy}/5</Text>
                </View>
              </View>
              <View style={ss.row}>
                <Text style={ss.rowLabel}>{t('pre_survey.motivation')}</Text>
                <View style={ss.emojiRow}>
                  <Text style={ss.emojiVal}>{MOOD_EMOJI[pre.motivation - 1]}</Text>
                  <Text style={ss.rowValue}>{pre.motivation}/5</Text>
                </View>
              </View>
              <View style={ss.row}>
                <Text style={ss.rowLabel}>{t('pre_survey.goal_difficulty')}</Text>
                <View style={ss.emojiRow}>
                  <Text style={ss.emojiVal}>{GOAL_EMOJI[pre.goal_difficulty - 1]}</Text>
                  <Text style={ss.rowValue}>{pre.goal_difficulty}/5</Text>
                </View>
              </View>
              <View style={ss.rowLast}>
                <Text style={ss.rowLabel}>{t('pre_survey.environment')}</Text>
                <Text style={ss.rowValue}>{t(`pre_survey.${pre.environment.toLowerCase()}`)}</Text>
              </View>
            </View>
          </>
        )}

        {/* Post-Survey */}
        {post && (
          <>
            <Text style={ss.sectionTitle}>{t('history.post_survey_title')}</Text>
            <View style={ss.card}>
              <View style={ss.row}>
                <Text style={ss.rowLabel}>{t('post_survey.productivity')}</Text>
                <View style={ss.emojiRow}>
                  <Text style={ss.emojiVal}>{POST_EMOJI[post.productivity - 1]}</Text>
                  <Text style={ss.rowValue}>{post.productivity}/5</Text>
                </View>
              </View>
              <View style={ss.row}>
                <Text style={ss.rowLabel}>{t('post_survey.focus')}</Text>
                <View style={ss.emojiRow}>
                  <Text style={ss.emojiVal}>{POST_EMOJI[post.focus - 1]}</Text>
                  <Text style={ss.rowValue}>{post.focus}/5</Text>
                </View>
              </View>
              <View style={ss.row}>
                <Text style={ss.rowLabel}>{t('post_survey.satisfaction')}</Text>
                <View style={ss.emojiRow}>
                  <Text style={ss.emojiVal}>{POST_EMOJI[post.satisfaction - 1]}</Text>
                  <Text style={ss.rowValue}>{post.satisfaction}/5</Text>
                </View>
              </View>
              <View style={ss.rowLast}>
                <Text style={ss.rowLabel}>{t('post_survey.distraction')}</Text>
                <View style={[ss.distractionPill, { backgroundColor: distractionColors[post.distraction]?.bg ?? colors.surfaceContainer }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: distractionColors[post.distraction]?.text ?? colors.onSurfaceVariant }}>
                    {distractionLabels[post.distraction] ?? post.distraction}
                  </Text>
                </View>
              </View>
            </View>

            {post.notes && (
              <>
                <Text style={ss.sectionTitle}>{t('post_survey.notes')}</Text>
                <View style={ss.notesBox}>
                  <Text style={ss.notesText}>{post.notes}</Text>
                </View>
              </>
            )}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useState, useCallback } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/ThemeContext";
import { useSessionContext } from '../../lib/SessionContext';
import type { AppColors } from "../../lib/theme";

type Session = {
  id: string;
  session_type: string;
  actual_duration: number | null;
  productivity_score: number | null;
  start_time: string;
  status: string;
};

type Recommendation = {
  id: string;
  content: string;
  reasoning: string | null;
  created_at: string;
};

type RecommendationSettings = {
  session_type?: string;
  duration_minutes?: number;
  environment?: string;
  music_type?: string;
  time_window?: string;
  daypart?: string;
};

function parseSettings(rec: Recommendation | null): RecommendationSettings | null {
  if (!rec?.reasoning) return null;
  try {
    const parsed = JSON.parse(rec.reasoning);
    return parsed.suggested_settings ?? null;
  } catch {
    return null;
  }
}

function buildRecommendationText(rec: Recommendation | null, settings: RecommendationSettings | null, t: (key: string, opts?: any) => string): string {
  if (!rec || !settings) return '';

  try {
    const parsed = JSON.parse(rec.reasoning ?? '{}');
    const insight = parsed.insight ?? {};
    const liftPct = insight.score_lift_pct ?? insight.score_lift ?? 0;
    const daypart = settings.daypart ?? '';
    const duration = settings.duration_minutes ?? 60;
    const sessionType = settings.session_type ?? '';
    const environment = settings.environment ?? '';

    const daypartKey = `dayparts.${daypart}`;
    const envKey = `environments.${environment}`;
    const typeKey = `session_types.${sessionType}`;

    if (liftPct > 0) {
      return t('home.rec_description_lift', {
        lift: liftPct,
        daypart: t(daypartKey),
        duration,
        type: t(typeKey),
        environment: t(envKey),
      });
    } else {
      return t('home.rec_description_basic', {
        duration,
        type: t(typeKey),
        environment: t(envKey),
      });
    }
  } catch {
    return rec.content;
  }
}

function getGreeting(t: (key: string) => string): string {
  const hour = new Date().getHours();
  if (hour < 12) return t("home.greeting_morning");
  if (hour < 18) return t("home.greeting_afternoon");
  return t("home.greeting_evening");
}

function formatDate(iso: string, t: (key: string) => string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isToday) return t("common.today");
  if (isYesterday) return t("common.yesterday");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const SESSION_EMOJI: Record<string, string> = {
  READING: "📖",
  WRITING: "✍️",
  CODING: "💻",
  TEST: "📝",
  OTHER: "🎯",
};

function scoreColor(score: number | null, colors: AppColors): string {
  if (score === null) return colors.onSurfaceVariant;
  if (score >= 70) return colors.primary;
  if (score >= 50) return colors.scoreAmber;
  return colors.scoreRed;
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const colors = useTheme();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const { activeSessionId, activeSessionType, pendingPostSurveyId } = useSessionContext();

  useFocusEffect(
    useCallback(() => {
      async function fetchData() {
        setLoading(true);
        try {
          const [sessionsData, recData] = await Promise.all([
            api.get<{ sessions: Session[] }>('/sessions'),
            api.get<{ recommendation: Recommendation | null }>('/recommendations/latest')
              .catch(() => ({ recommendation: null })),
          ]);
          setSessions(sessionsData.sessions);
          setRecommendation(recData.recommendation);
          const { data: { user } } = await supabase.auth.getUser();
          const name =
            user?.user_metadata?.full_name?.split(' ')[0] ??
            user?.user_metadata?.name?.split(' ')[0] ??
            user?.email?.split('@')[0] ??
            null;
          setUserName(name);
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      }
      fetchData();
    }, []),
  );

  const settings = parseSettings(recommendation);
  const recommendationText = buildRecommendationText(recommendation, settings, t);

  const completedSessions = sessions.filter((s) => s.status === "COMPLETED");
  const sessionCount = completedSessions.length;
  const scoredSessions = completedSessions.filter(
    (s) => s.productivity_score !== null,
  );
  const avgScore =
    scoredSessions.length > 0
      ? Math.round(
          (scoredSessions.reduce(
            (sum, s) => sum + (s.productivity_score as number),
            0,
          ) /
            scoredSessions.length) *
            10,
        ) / 10
      : null;
  const bestScore =
    scoredSessions.length > 0
      ? Math.max(...scoredSessions.map((s) => s.productivity_score as number))
      : null;
  const recentSessions = sessions.slice(0, 3);

  const [tipIndex] = useState(() => Math.floor(Math.random() * 6));
  const scienceTip = [
    t("home.science_tip_1"),
    t("home.science_tip_2"),
    t("home.science_tip_3"),
    t("home.science_tip_4"),
    t("home.science_tip_5"),
    t("home.science_tip_6"),
  ][tipIndex];

  return (
    <ScrollView
      className="flex-1 bg-surface dark:bg-[#0f1a14]"
      contentContainerClassName="pb-10"
      showsVerticalScrollIndicator={false}
    >
      {/* Top Bar */}
      <View className="px-6 pt-10 flex-row items-center mb-6">
        <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: '#2c694e', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, borderColor: '#b1f0ce', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#b1f0ce', alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#b1f0ce' }} />
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'column' }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: '#2b3437' }}
              className="dark:text-[#e8f0eb]">
              Focus
            </Text>
            <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: '#2c694e' }}>
              {' '}AI
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: '#586064', fontWeight: '400', letterSpacing: 0.3, marginTop: -2 }}
            className="dark:text-[#9ab0a0]">
            {t('common.intelligent_focus')}
          </Text>
        </View>
      </View>

      {/* Greeting */}
      <View className="px-6 mb-10">
        <Text className="text-4xl font-extrabold text-on-surface dark:text-[#e8f0eb] tracking-tight leading-tight">
          {`${getGreeting(t)}${userName ? `, ${userName.charAt(0).toUpperCase() + userName.slice(1)}` : ''}.`}
        </Text>
      </View>

      {/* Primary AI Recommendation Bento Card */}
      <View className="mx-6 mb-6 rounded-xl bg-surface-container-low dark:bg-[#1e2d24] p-8 overflow-hidden">
        {/* AI Badge */}
        <View className="flex-row items-center self-start px-3 py-1 rounded-full bg-tertiary-container dark:bg-[#2a3318] mb-6">
          <Text className="text-xs font-semibold text-on-tertiary-container dark:text-[#c8d89a] tracking-wide">
            {recommendation ? t("home.ai_recommendation") : t("home.not_enough_data")}
          </Text>
        </View>

        {/* Recommendation Text */}
        <Text className="text-2xl font-bold text-on-surface dark:text-[#e8f0eb] leading-snug mb-8 max-w-xs">
          {recommendation
            ? recommendationText
            : sessionCount === 0
              ? t("home.no_sessions")
              : t("home.complete_more")}
        </Text>

        {/* Primary CTA */}
        <TouchableOpacity
          className="bg-primary dark:bg-[#4ade80] h-14 rounded-xl items-center justify-center flex-row gap-2 mb-3"
          onPress={() => {
            if (activeSessionId) {
              router.push(`/(app)/session?id=${activeSessionId}&sessionType=${activeSessionType}`);
            } else if (pendingPostSurveyId) {
              router.push(`/(app)/post-survey?id=${pendingPostSurveyId}&sessionType=OTHER`);
            } else {
              router.push('/(app)/quick-start');
            }
          }}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text className="text-on-primary dark:text-[#0a1f12] font-bold text-lg">
            {activeSessionId
              ? t('session.return_to_session')
              : pendingPostSurveyId
              ? t('session.complete_survey')
              : t('home.quick_session')}
          </Text>
          <MaterialCommunityIcons name="arrow-right" size={20} color={colors.onPrimary} />
        </TouchableOpacity>

        {/* Secondary CTA */}
        {!activeSessionId && !pendingPostSurveyId && (
          <TouchableOpacity
            className="h-10 self-center px-6 items-center justify-center rounded-lg bg-surface-container-highest/60 dark:bg-[#2a3d2a]/60"
            activeOpacity={0.7}
            onPress={() => router.push("/(app)/pre-survey?custom=true")}
          >
            <Text className="text-sm font-semibold text-on-surface dark:text-[#e8f0eb]">
              {t("home.custom_session")}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Secondary Metrics Bento Grid — hidden when no sessions */}
      {sessionCount > 0 && (
        <View className="mx-6 mb-10" style={{ gap: 12 }}>
          {/* Row 1: Focus Score — full width */}
          <View
            className="rounded-2xl p-4"
            style={{ backgroundColor: colors.surfaceContainerLow }}
          >
            <View className="flex-row items-center mb-2">
              <MaterialCommunityIcons
                name="lightning-bolt"
                size={12}
                color={colors.onSurfaceVariant}
              />
              <Text className="text-xs font-semibold text-on-surface-variant dark:text-[#9ab0a0] tracking-wide uppercase ml-1">
                {t("home.focus_score")}
              </Text>
            </View>
            <Text className="text-5xl font-extrabold text-on-surface dark:text-[#e8f0eb]">
              {avgScore !== null ? `${avgScore}%` : "—"}
            </Text>
            <Text className="text-xs text-on-surface-variant dark:text-[#9ab0a0] mt-1">
              {sessionCount} {t("home.sessions_total")}
            </Text>
          </View>

          {/* Row 2: Best Score + Sessions side by side */}
          <View className="flex-row" style={{ gap: 12 }}>
            <View
              className="flex-1 rounded-2xl p-4"
              style={{ backgroundColor: colors.surfaceContainerLow }}
            >
              <Text className="text-xs font-semibold text-on-surface-variant dark:text-[#9ab0a0] tracking-wide uppercase mb-2">
                {t("home.best_score")}
              </Text>
              <Text className="text-3xl font-extrabold text-on-surface dark:text-[#e8f0eb]">
                {bestScore !== null ? `${bestScore}` : "—"}
              </Text>
              <Text className="text-xs text-on-surface-variant dark:text-[#9ab0a0] mt-1">
                {t("home.best_session_score")}
              </Text>
            </View>
            <View
              className="flex-1 rounded-2xl p-4"
              style={{ backgroundColor: colors.surfaceContainerLow }}
            >
              <Text className="text-xs font-semibold text-on-surface-variant dark:text-[#9ab0a0] tracking-wide uppercase mb-2">
                {t("home.sessions_label")}
              </Text>
              <Text className="text-3xl font-extrabold text-on-surface dark:text-[#e8f0eb]">
                {sessionCount}
              </Text>
              <Text className="text-xs text-on-surface-variant dark:text-[#9ab0a0] mt-1">
                {t("home.total_completed")}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Recent Patterns Section */}
      <View className="px-6 mb-10">
        <View className="flex-row items-center justify-between mb-5">
          <Text className="text-xl font-bold text-on-surface dark:text-[#e8f0eb]">
            {t("home.recent_patterns")}
          </Text>
        </View>

        {recentSessions.length > 0 ? (
          recentSessions.map((session) => (
            <View
              key={session.id}
              className="flex-row items-center gap-4 p-2 rounded-xl"
            >
              <Text style={{ fontSize: 28 }}>
                {SESSION_EMOJI[session.session_type] ?? "🎯"}
              </Text>
              <View className="flex-1">
                <Text className="font-semibold text-on-surface dark:text-[#e8f0eb] text-sm">
                  {t(`session_types.${session.session_type}`) || session.session_type}
                </Text>
                <Text className="text-sm text-on-surface-variant dark:text-[#9ab0a0] mt-0.5">
                  {formatDate(session.start_time, t)}
                  {session.actual_duration != null
                    ? ` · ${session.actual_duration} ${t("home.mins")}`
                    : ""}
                </Text>
              </View>
              {session.productivity_score !== null && (
                <Text
                  className="font-bold text-sm"
                  style={{ color: scoreColor(session.productivity_score, colors) }}
                >
                  {session.productivity_score}
                </Text>
              )}
            </View>
          ))
        ) : (
          /* Empty state row */
          <View className="flex-row items-center gap-4 p-2 rounded-xl">
            <View className="w-12 h-12 rounded-xl bg-surface-container-high dark:bg-[#243320] items-center justify-center">
              <Text className="text-primary dark:text-[#4ade80] text-lg">—</Text>
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-on-surface dark:text-[#e8f0eb] text-sm">
                {t("home.no_sessions")}
              </Text>
              <Text className="text-sm text-on-surface-variant dark:text-[#9ab0a0] mt-0.5">
                {t("home.empty_subtitle")}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Scientific Note / AI Chip */}
      <View className="mx-6 rounded-xl p-6 bg-surface-container-low dark:bg-[#1e2d24] border border-outline-variant/10">
        <View className="flex-row gap-4">
          <View className="mt-0.5">
            <Text className="text-primary dark:text-[#4ade80] text-xl">🧬</Text>
          </View>
          <View className="flex-1">
            <Text className="font-bold text-on-surface dark:text-[#e8f0eb] text-base mb-1">
              {t("home.scientific_note")}
            </Text>
            <Text className="text-sm text-on-surface-variant dark:text-[#9ab0a0] leading-relaxed">
              {scienceTip}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

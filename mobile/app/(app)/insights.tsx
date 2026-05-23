import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../lib/ThemeContext';
import type { AppColors } from '../../lib/theme';
import { api } from '../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type Session = {
  id: string;
  session_type: string;
  actual_duration: number | null;
  productivity_score: number | null;
  start_time: string;
  status: string;
};

type PostSurvey = {
  productivity: number;
  focus: number;
  satisfaction: number;
  distraction: 'NONE' | 'FEW' | 'MANY';
  notes: string | null;
};

type SingleSession = {
  id: string;
  productivity_score: number | null;
  post_survey: PostSurvey | null;
};

type Recommendation = {
  id: string;
  content: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const TIME_BUCKETS = ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];

const CHART_BARS_HEIGHT = 200;

// ── Color helpers (accept colors token object) ────────────────────────────────

function scoreTextColor(score: number | null, colors: AppColors): string {
  if (score === null) return colors.onSurfaceVariant;
  if (score >= 70) return colors.onPrimaryContainer;
  if (score >= 50) return colors.scoreRingMidBorder;
  return colors.scoreRingLowText;
}

function scoreBgColor(score: number | null, colors: AppColors): string {
  if (score === null) return colors.surfaceContainer;
  if (score >= 70) return colors.primaryContainer;
  if (score >= 50) return colors.scoreRingMid;
  return colors.scoreRedBg;
}

function pillTextColor(score: number | null, colors: AppColors): string {
  if (score === null) return colors.onSurfaceVariant;
  if (score >= 70) return colors.onPrimaryContainer;
  if (score >= 50) return colors.scoreRingMidText;
  return colors.scoreRingLowBorder;
}

function circleColors(score: number, colors: AppColors): { bg: string; text: string } {
  if (score >= 70) return { bg: colors.primaryContainer, text: colors.onPrimaryContainer };
  if (score >= 50) return { bg: colors.scoreAmberBg, text: colors.scoreRingMidBorder };
  return { bg: colors.scoreRedBg, text: colors.error };
}

function getBucketIndex(hour: number): number {
  if (hour >= 6 && hour < 9) return 0;
  if (hour >= 9 && hour < 12) return 1;
  if (hour >= 12 && hour < 15) return 2;
  if (hour >= 15 && hour < 18) return 3;
  if (hour >= 18 && hour < 21) return 4;
  if (hour >= 21) return 5;
  return -1;
}

function computeWeekChange(sessions: Session[]): string {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(now.getDate() - 14);

  const scored = sessions.filter(
    (s) => s.status === 'COMPLETED' && s.productivity_score !== null,
  );
  const thisWeek = scored.filter((s) => new Date(s.start_time) >= sevenDaysAgo);
  const lastWeek = scored.filter((s) => {
    const d = new Date(s.start_time);
    return d >= fourteenDaysAgo && d < sevenDaysAgo;
  });

  if (lastWeek.length === 0) return '+0%';

  const thisAvg =
    thisWeek.length > 0
      ? thisWeek.reduce((sum, s) => sum + s.productivity_score!, 0) / thisWeek.length
      : 0;
  const lastAvg =
    lastWeek.reduce((sum, s) => sum + s.productivity_score!, 0) / lastWeek.length;
  const change = Math.round(((thisAvg - lastAvg) / lastAvg) * 100);
  return change >= 0 ? `+${change}%` : `${change}%`;
}

// ── StyleSheet factory ────────────────────────────────────────────────────────

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    // ── Shared ──────────────────────────────────────────────────────────────
    root: { flex: 1, backgroundColor: colors.surface },
    scroll: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
    loadingText: { fontSize: 15, color: colors.onSurfaceVariant },
    errorText: { fontSize: 15, color: colors.error },
    retryBtn: {
      paddingHorizontal: 24, paddingVertical: 12,
      backgroundColor: colors.primary, borderRadius: 12,
    },
    retryBtnText: { fontSize: 15, fontWeight: '600', color: colors.onPrimary },

    // ── Overview ──────────────────────────────────────────────────────────────
    overviewContent: { paddingBottom: 32 },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingVertical: 16,
      backgroundColor: colors.surface,
    },
    topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    topBarTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: -0.5,
    },

    section: { paddingHorizontal: 24, marginBottom: 32 },

    // Hero cards
    heroCard: {
      borderRadius: 16,
      padding: 24,
      overflow: 'hidden',
      minHeight: 200,
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
    heroTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.onPrimary,
      lineHeight: 30,
      letterSpacing: -0.3,
    },
    glassPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.overlayLight,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
    },
    glassPillText: { fontSize: 13, fontWeight: '600', color: colors.primary },
    heroDecorCircleGreen: {
      position: 'absolute',
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: colors.primaryDim,
      opacity: 0.5,
      right: -40,
      bottom: -40,
    },
    heroDecorRingOlive: {
      position: 'absolute',
      width: 120,
      height: 120,
      borderRadius: 60,
      borderWidth: 14,
      borderColor: colors.scoreRingHighBorder,
      opacity: 0.2,
      right: -16,
      top: -16,
    },

    // Bar chart
    chartSectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      marginBottom: 16,
      gap: 12,
    },
    analyticalLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.onSurfaceVariant,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    chartTitle: { fontSize: 20, fontWeight: '700', color: colors.onSurface },
    toggleRow: { flexDirection: 'row', gap: 8 },
    toggleBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.surfaceContainerHigh,
    },
    toggleBtnActive: { backgroundColor: colors.primary },
    toggleBtnText: { fontSize: 12, fontWeight: '500', color: colors.onSurfaceVariant },
    toggleBtnActiveText: { fontSize: 12, fontWeight: '600', color: colors.onPrimary },
    chartContainer: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 16,
      padding: 20,
      height: CHART_BARS_HEIGHT + 60,
    },
    barsRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 6,
    },
    barColumn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-end',
      height: '100%',
    },
    chartBar: { width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
    barLabel: { fontSize: 9, color: colors.onSurfaceMuted, marginTop: 8, textAlign: 'center' },
    barScoreLabel: { fontSize: 9, fontWeight: '700', color: colors.onSurfaceVariant, marginBottom: 4, textAlign: 'center' },

    // Table
    tableHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    tableTitle: { fontSize: 20, fontWeight: '700', color: colors.onSurface },
    exportRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    exportText: { fontSize: 13, fontWeight: '500', color: colors.primary },
    tableCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    tableHeaderBg: { backgroundColor: colors.surfaceContainerLow },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    tableRowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceContainer,
    },
    colHeader: { fontSize: 12, fontWeight: '700', color: colors.onSurfaceVariant },
    tableCellRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cellTypeText: { fontSize: 14, fontWeight: '500', color: colors.onSurface },
    cellMuted: { fontSize: 13, color: colors.onSurfaceVariant },
    efficiencyPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    efficiencyText: { fontSize: 12, fontWeight: '700' },
    tableEmptyRow: { padding: 24, alignItems: 'center' },
    tableEmptyText: { fontSize: 13, color: colors.onSurfaceMuted },

    // AI Recommendation
    recCard: {
      backgroundColor: colors.tertiaryContainer,
      borderRadius: 16,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      borderWidth: 1,
      borderColor: colors.tertiaryOverlay,
    },
    recTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.onSurface,
      marginBottom: 6,
    },
    recBody: { fontSize: 14, color: colors.onTertiaryContainer, lineHeight: 22 },

    // ── Single session ──────────────────────────────────────────────────────
    singleContent: { paddingBottom: 48 },
    singleHeader: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 8 },
    singleEyebrow: {
      fontSize: 11, fontWeight: '700', color: colors.primary,
      letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4,
    },
    singleTitle: { fontSize: 36, fontWeight: '800', color: colors.onSurface, letterSpacing: -1 },
    scoreSection: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
    scoreCircle: {
      width: 200, height: 200, borderRadius: 100,
      alignItems: 'center', justifyContent: 'center', marginBottom: 20,
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15, shadowRadius: 24, elevation: 8,
    },
    scoreDigits: { fontSize: 72, fontWeight: '800', letterSpacing: -3, lineHeight: 80 },
    scoreUnit: { fontSize: 14, fontWeight: '600', opacity: 0.7 },
    scoreLabel: {
      fontSize: 12, fontWeight: '700', color: colors.onSurfaceVariant,
      letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12,
    },
    scoreBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 },
    scoreBadgeText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
    singleSectionHeader: { paddingHorizontal: 24, marginBottom: 16 },
    singleSectionTitle: { fontSize: 18, fontWeight: '700', color: colors.onSurface },
    metricsGrid: { paddingHorizontal: 24, gap: 12, marginBottom: 16 },
    metricCard: {
      backgroundColor: colors.surfaceContainerLowest, borderRadius: 16, padding: 20,
      shadowColor: colors.onSurface, shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    metricLabel: {
      fontSize: 11, fontWeight: '700', color: colors.onSurfaceVariant,
      textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
    },
    metricValue: { fontSize: 28, fontWeight: '800', color: colors.onSurface, marginBottom: 10 },
    metricMax: { fontSize: 16, fontWeight: '500', color: colors.outlineVariant },
    barTrack: { height: 6, backgroundColor: colors.surfaceContainer, borderRadius: 999, overflow: 'hidden' },
    barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 999 },
    distractionCard: {
      marginHorizontal: 24, marginBottom: 12, backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: colors.onSurface, shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    distractionCardLabel: { fontSize: 14, fontWeight: '600', color: colors.onSurface },
    distractionPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
    distractionPillText: { fontSize: 12, fontWeight: '700' },
    notesCard: {
      marginHorizontal: 24, marginBottom: 12, backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16, padding: 20,
      shadowColor: colors.onSurface, shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    notesLabel: {
      fontSize: 11, fontWeight: '700', color: colors.onSurfaceVariant,
      textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
    },
    notesText: { fontSize: 14, color: colors.onSurface, lineHeight: 22 },
    insightChip: {
      marginHorizontal: 24, marginTop: 8, marginBottom: 32,
      backgroundColor: colors.surfaceContainerLow, borderRadius: 16, padding: 20,
      flexDirection: 'row', gap: 14,
    },
    insightChipIcon: { fontSize: 20, marginTop: 2 },
    insightChipBody: { flex: 1 },
    insightChipTitle: { fontSize: 14, fontWeight: '700', color: colors.onSurface, marginBottom: 4 },
    insightChipText: { fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 20 },
    homeBtn: {
      marginHorizontal: 24, height: 56, backgroundColor: colors.primary,
      borderRadius: 16, alignItems: 'center', justifyContent: 'center',
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
    },
    homeBtnText: { fontSize: 16, fontWeight: '700', color: colors.onPrimary },
  });
}

// ── Single session sub-components ─────────────────────────────────────────────

function ScoreBar({ value }: { value: number }) {
  const colors = useTheme();
  const ss = useMemo(() => makeStyles(colors), [colors]);
  const pct = Math.round((value / 5) * 100);
  return (
    <View style={ss.barTrack}>
      <View style={[ss.barFill, { width: `${pct}%` as any }]} />
    </View>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  const colors = useTheme();
  const ss = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={ss.metricCard}>
      <Text style={ss.metricLabel}>{label}</Text>
      <Text style={ss.metricValue}>
        {value}
        <Text style={ss.metricMax}>/5</Text>
      </Text>
      <ScoreBar value={value} />
    </View>
  );
}

// ── Single session view ───────────────────────────────────────────────────────

function SingleSessionInsights({ id }: { id: string }) {
  const { t } = useTranslation();
  const colors = useTheme();
  const ss = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const [session, setSession] = useState<SingleSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchSession() {
      try {
        const data = await api.get<{ session: SingleSession }>(`/sessions/${id}`);
        setSession(data.session);
      } catch (e) {
        console.error(e);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    if (id) fetchSession();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={ss.root}>
        <StatusBar style={colors.statusBarStyle} />
        <View style={ss.centered}>
          <Text style={ss.loadingText}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !session) {
    return (
      <SafeAreaView style={ss.root}>
        <StatusBar style={colors.statusBarStyle} />
        <View style={ss.centered}>
          <Text style={ss.errorText}>{t('common.error')}</Text>
          <TouchableOpacity style={ss.retryBtn} onPress={() => router.replace('/(app)')}>
            <Text style={ss.retryBtnText}>{t('common.continue')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const survey = session.post_survey;
  const score = session.productivity_score;
  const distraction = survey?.distraction ?? 'NONE';

  if (score === null) {
    return (
      <SafeAreaView style={ss.root}>
        <StatusBar style={colors.statusBarStyle} />
        <View style={ss.centered}>
          <Text style={ss.loadingText}>{t('insights.calculating')}</Text>
          <Text style={[ss.loadingText, { fontSize: 12, marginTop: 8, opacity: 0.6 }]}>
            {t('insights.score_computing')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { bg: circleBg, text: circleText } = circleColors(score, colors);

  const distractionBg: Record<string, string> = {
    NONE: colors.tertiaryContainer,
    FEW: colors.surfaceContainer,
    MANY: colors.scoreRedBg,
  };
  const distractionText: Record<string, string> = {
    NONE: colors.onTertiaryContainer,
    FEW: colors.onSurfaceVariant,
    MANY: colors.error,
  };
  const distractionLabel: Record<string, string> = {
    NONE: t('insights.distraction_none'),
    FEW: t('insights.distraction_few'),
    MANY: t('insights.distraction_many'),
  };

  const scoreBadgeLabel =
    score >= 80
      ? t('insights.excellent')
      : score >= 60
      ? t('insights.good')
      : score >= 40
      ? t('insights.fair')
      : t('insights.needs_work');

  return (
    <SafeAreaView style={ss.root}>
      <StatusBar style={colors.statusBarStyle} />
      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.singleContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={ss.singleHeader}>
          <Text style={ss.singleEyebrow}>{t('insights.session_complete')}</Text>
          <Text style={ss.singleTitle}>{t('insights.your_results')}</Text>
        </View>

        <View style={ss.scoreSection}>
          <View style={[ss.scoreCircle, { backgroundColor: circleBg }]}>
            <Text style={[ss.scoreDigits, { color: circleText }]}>{score}</Text>
            <Text style={[ss.scoreUnit, { color: circleText }]}>/ 100</Text>
          </View>
          <Text style={ss.scoreLabel}>{t('insights.productivity_score')}</Text>
          <View style={[ss.scoreBadge, { backgroundColor: scoreBgColor(score, colors) }]}>
            <Text style={[ss.scoreBadgeText, { color: scoreTextColor(score, colors) }]}>
              {scoreBadgeLabel}
            </Text>
          </View>
        </View>

        {survey && (
          <>
            <View style={ss.singleSectionHeader}>
              <Text style={ss.singleSectionTitle}>{t('insights.breakdown')}</Text>
            </View>
            <View style={ss.metricsGrid}>
              <MetricCard label={t('post_survey.productivity')} value={survey.productivity} />
              <MetricCard label={t('post_survey.focus')} value={survey.focus} />
              <MetricCard label={t('post_survey.satisfaction')} value={survey.satisfaction} />
            </View>
            <View style={ss.distractionCard}>
              <Text style={ss.distractionCardLabel}>{t('insights.distraction')}</Text>
              <View style={[ss.distractionPill, { backgroundColor: distractionBg[distraction] }]}>
                <Text style={[ss.distractionPillText, { color: distractionText[distraction] }]}>
                  {distractionLabel[distraction]}
                </Text>
              </View>
            </View>
            {survey.notes ? (
              <View style={ss.notesCard}>
                <Text style={ss.notesLabel}>{t('insights.notes_label')}</Text>
                <Text style={ss.notesText}>{survey.notes}</Text>
              </View>
            ) : null}
          </>
        )}

        <View style={ss.insightChip}>
          <Text style={ss.insightChipIcon}>💡</Text>
          <View style={ss.insightChipBody}>
            <Text style={ss.insightChipTitle}>{t('insights.ai_note_title')}</Text>
            <Text style={ss.insightChipText}>
              {t('insights.ai_note_body')}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={ss.homeBtn}
          onPress={() => {
            router.setParams({ id: undefined });
            router.replace('/(app)/insights');
          }}
          activeOpacity={0.85}
        >
          <Text style={ss.homeBtnText}>{t('insights.go_to_insights')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

let _insightsCache: any[] = [];
let _insightsCacheTime = 0;
const INSIGHTS_CACHE_TTL = 30000;

// ── Overview view ─────────────────────────────────────────────────────────────

function InsightsOverview() {
  const { t } = useTranslation();
  const colors = useTheme();
  const ss = useMemo(() => makeStyles(colors), [colors]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<'daily' | 'weekly'>('weekly');

  useFocusEffect(
    useCallback(() => {
      async function fetchData() {
        const now = Date.now();
        const useCache = _insightsCache.length > 0 && now - _insightsCacheTime < INSIGHTS_CACHE_TTL;

        if (!useCache) setLoading(true);

        try {
          const [sessionsData, recData] = await Promise.all([
            useCache
              ? Promise.resolve({ sessions: _insightsCache })
              : api.get<{ sessions: Session[] }>('/sessions/all'),
            api.get<{ recommendation: Recommendation | null }>('/recommendations/latest')
              .catch(() => ({ recommendation: null })),
          ]);

          if (!useCache) {
            _insightsCache = sessionsData.sessions;
            _insightsCacheTime = Date.now();
          }

          setSessions(sessionsData.sessions);
          setRecommendation(recData.recommendation);
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      }
      fetchData();
    }, []),
  );

  // ── Computed stats ──────────────────────────────────────────────────────────

  const completed = sessions.filter(
    (s) => s.status === 'COMPLETED' && s.productivity_score !== null,
  );

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const totalHours = (() => {
    const mins = sessions
      .filter((s) => s.status === 'COMPLETED' && s.actual_duration !== null && new Date(s.start_time) >= sevenDaysAgo)
      .reduce((sum, s) => sum + s.actual_duration!, 0);
    return Math.round((mins / 60) * 10) / 10;
  })();

  const avgScore =
    completed.length > 0
      ? Math.round(
          completed.reduce((sum, s) => sum + s.productivity_score!, 0) / completed.length,
        )
      : null;

  const weekChange = sessions.length > 0 ? computeWeekChange(sessions) : '+0%';
  const weekChangePositive = !weekChange.startsWith('-');

  const chartSessions = completed.filter((s) => {
    const d = new Date(s.start_time);
    if (period === 'daily') return d >= todayStart;
    return d >= sevenDaysAgo;
  });

  const bucketData = TIME_BUCKETS.map((label, i) => {
    const inBucket = chartSessions.filter(
      (s) => getBucketIndex(new Date(s.start_time).getHours()) === i,
    );
    if (inBucket.length === 0) return { label, avgScore: null };
    const avg =
      inBucket.reduce((sum, s) => sum + s.productivity_score!, 0) / inBucket.length;
    return { label, avgScore: Math.round(avg) };
  });

  const maxBucketScore = Math.max(...bucketData.map((b) => b.avgScore ?? 0), 1);
  const highestBucketIdx = bucketData.reduce(
    (best, b, i) =>
      (b.avgScore ?? 0) > (bucketData[best].avgScore ?? 0) ? i : best,
    0,
  );

  const typeMap: Record<string, { totalDuration: number; scores: number[] }> = {};
  sessions
    .filter((s) => s.status === 'COMPLETED')
    .forEach((s) => {
      if (!typeMap[s.session_type])
        typeMap[s.session_type] = { totalDuration: 0, scores: [] };
      if (s.actual_duration !== null)
        typeMap[s.session_type].totalDuration += s.actual_duration;
      if (s.productivity_score !== null)
        typeMap[s.session_type].scores.push(s.productivity_score);
    });

  const typeRows = Object.entries(typeMap).map(([type, data]) => ({
    type,
    totalDuration: data.totalDuration,
    avgScore:
      data.scores.length > 0
        ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
        : null,
  }));

  const SESSION_EMOJI: Record<string, string> = {
    READING: '📖', WRITING: '✍️', CODING: '💻', TEST: '📝', OTHER: '🎯',
  };

  async function exportData() {
    try {
      if (!sessions || sessions.length === 0) {
        Alert.alert(t('insights.export_no_data'), t('insights.export_no_data_msg'));
        return;
      }

      const header = 'Date,Session Type,Duration (min),Productivity Score,Focus,Satisfaction,Distraction,Notes';
      const rows = sessions.map((s: any) => {
        const date = new Date(s.start_time).toLocaleDateString();
        const type = s.session_type ?? 'OTHER';
        const duration = s.actual_duration ? Math.round(s.actual_duration / 60) : 0;
        const score = s.productivity_score ?? '';
        const focus = s.post_survey?.focus ?? '';
        const satisfaction = s.post_survey?.satisfaction ?? '';
        const distraction = s.post_survey?.distraction ?? '';
        const notes = (s.post_survey?.notes ?? '').replace(/,/g, ';').replace(/\n/g, ' ');
        return `${date},${type},${duration},${score},${focus},${satisfaction},${distraction},${notes}`;
      });
      const csv = [header, ...rows].join('\n');

      const filename = `focusai-sessions-${Date.now()}.csv`;
      const filepath = FileSystem.cacheDirectory + filename;
      await FileSystem.writeAsStringAsync(filepath, csv, { encoding: 'utf8' });

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(t('insights.export_unavailable'), t('insights.export_unavailable_msg'));
        return;
      }
      await Sharing.shareAsync(filepath, {
        mimeType: 'text/csv',
        dialogTitle: t('insights.export_data'),
        UTI: 'public.comma-separated-values-text',
      });
    } catch (err: any) {
      console.error('Export error:', err);
      Alert.alert('Export Error', err?.message ?? String(err));
    }
  }

  function getHoursMessage(): string {
    if (totalHours === 0) return t('insights.hours_zero');
    if (totalHours < 2) return t('insights.hours_low', { hours: totalHours });
    if (totalHours < 5) return t('insights.hours_medium', { hours: totalHours });
    return t('insights.hours_high', { hours: totalHours });
  }

  function getEfficiencyMessage(): string {
    if (avgScore === null) return t('insights.efficiency_no_data');
    if (avgScore >= 80) return t('insights.efficiency_high', { score: avgScore });
    if (avgScore >= 60) return t('insights.efficiency_medium', { score: avgScore });
    if (avgScore >= 40) return t('insights.efficiency_low', { score: avgScore });
    return t('insights.efficiency_very_low', { score: avgScore });
  }

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

  return (
    <SafeAreaView style={ss.root}>
      <StatusBar style={colors.statusBarStyle} />
      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.overviewContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Top App Bar ── */}
        <View style={ss.topBar}>
          <View style={ss.topBarLeft}>
            <Text style={ss.topBarTitle}>{t('insights.title')}</Text>
          </View>
        </View>

        {/* ── SECTION 1: Hero Cards ── */}
        <View style={ss.section}>
          <View style={[ss.heroCard, { backgroundColor: colors.primary, marginBottom: 12 }]}>
            <View style={ss.heroDecorCircleGreen} />
            <View style={{ zIndex: 1 }}>
              <MaterialCommunityIcons
                name="timer-outline"
                size={36}
                color={colors.primaryFixedDim}
                style={{ marginBottom: 12 }}
              />
              <Text style={ss.heroTitle}>
                {getHoursMessage()}
              </Text>
            </View>
            <View style={{ zIndex: 1, marginTop: 20 }}>
              <View style={ss.glassPill}>
                <MaterialCommunityIcons
                  name={weekChangePositive ? 'trending-up' : 'trending-down'}
                  size={14}
                  color={colors.primary}
                />
                <Text style={ss.glassPillText}>{weekChange} {t('insights.from_last_week')}</Text>
              </View>
            </View>
          </View>

          <View style={[ss.heroCard, { backgroundColor: colors.tertiary }]}>
            <View style={ss.heroDecorRingOlive} />
            <View style={{ zIndex: 1 }}>
              <MaterialCommunityIcons
                name="lightning-bolt"
                size={36}
                color={colors.scoreRingHigh}
                style={{ marginBottom: 12 }}
              />
              <Text style={[ss.heroTitle, { color: colors.onTertiary }]}>
                {getEfficiencyMessage()}
              </Text>
            </View>
          </View>
        </View>

        {/* ── SECTION 2: Bar Chart ── */}
        <View style={ss.section}>
          <Text style={ss.analyticalLabel}>{t('insights.analytical_overview')}</Text>
          <View style={ss.chartSectionHeader}>
            <Text style={ss.chartTitle}>
              {period === 'daily' ? t('insights.daily_overview') : t('insights.weekly_overview')}
            </Text>
            <View style={ss.toggleRow}>
              <TouchableOpacity
                style={[ss.toggleBtn, period === 'daily' && ss.toggleBtnActive]}
                onPress={() => setPeriod('daily')}
                activeOpacity={0.7}
              >
                <Text style={period === 'daily' ? ss.toggleBtnActiveText : ss.toggleBtnText}>
                  {t('insights.daily')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ss.toggleBtn, period === 'weekly' && ss.toggleBtnActive]}
                onPress={() => setPeriod('weekly')}
                activeOpacity={0.7}
              >
                <Text style={period === 'weekly' ? ss.toggleBtnActiveText : ss.toggleBtnText}>
                  {t('insights.weekly')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={ss.chartContainer}>
            <View style={ss.barsRow}>
              {bucketData.map((bucket, i) => {
                const isHighest =
                  i === highestBucketIdx && bucket.avgScore !== null;
                const barH =
                  bucket.avgScore !== null
                    ? Math.max(
                        Math.round(CHART_BARS_HEIGHT * 0.1),
                        Math.round((bucket.avgScore / maxBucketScore) * CHART_BARS_HEIGHT),
                      )
                    : Math.round(CHART_BARS_HEIGHT * 0.1);
                return (
                  <View key={bucket.label} style={ss.barColumn}>
                    {bucket.avgScore !== null && (
                      <Text style={ss.barScoreLabel}>{bucket.avgScore}</Text>
                    )}
                    <View
                      style={[ss.chartBar, {
                        height: barH,
                        backgroundColor: isHighest ? colors.primary : colors.primaryFixedDim,
                      }]}
                    />
                    <Text
                      style={[
                        ss.barLabel,
                        isHighest && { color: colors.primary, fontWeight: '700' },
                      ]}
                    >
                      {bucket.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── SECTION 3: Focus Trends Table ── */}
        <View style={ss.section}>
          <View style={ss.tableHeaderRow}>
            <Text style={ss.tableTitle}>{t('insights.focus_trends')}</Text>
            <TouchableOpacity
              style={ss.exportRow}
              onPress={exportData}
              activeOpacity={0.7}
            >
              <Text style={ss.exportText}>{t('insights.export_data')}</Text>
              <MaterialCommunityIcons name="download" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={ss.tableCard}>
            <View style={[ss.tableRow, ss.tableHeaderBg]}>
              <Text style={[ss.colHeader, { flex: 2.5 }]}>{t('insights.study_type')}</Text>
              <Text style={[ss.colHeader, { flex: 1.2, textAlign: 'center' }]}>{t('insights.duration_col')}</Text>
              <Text style={[ss.colHeader, { flex: 1, textAlign: 'center' }]}>{t('insights.efficiency_col')}</Text>
              <Text style={[ss.colHeader, { flex: 0.5, textAlign: 'right', paddingRight: 4 }]}>{t('insights.trend_col')}</Text>
            </View>

            {typeRows.length === 0 ? (
              <View style={ss.tableEmptyRow}>
                <Text style={ss.tableEmptyText}>{t('insights.no_sessions')}</Text>
              </View>
            ) : (
              typeRows.map((row, idx) => {
                const isLast = idx === typeRows.length - 1;
                const score = row.avgScore ?? 0;
                const trendIcon =
                  score >= 70 ? 'trending-up' : score >= 50 ? 'trending-neutral' : 'trending-down';
                const trendColor =
                  score >= 70 ? colors.primary : score >= 50 ? colors.scoreAmber : colors.error;
                return (
                  <View
                    key={row.type}
                    style={[ss.tableRow, !isLast && ss.tableRowDivider]}
                  >
                    <View style={{ flex: 2.5, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 18 }}>
                        {SESSION_EMOJI[row.type] ?? '🎯'}
                      </Text>
                      <Text style={[ss.cellTypeText, { flex: 1 }]} numberOfLines={1} ellipsizeMode="tail">
                        {t(`session_types.${row.type}`) ?? t('session_types.OTHER')}
                      </Text>
                    </View>

                    <View style={{ flex: 1.2, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={ss.cellMuted} numberOfLines={1}>{row.totalDuration} {t('history.mins')}</Text>
                    </View>

                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <View
                        style={[
                          ss.efficiencyPill,
                          { backgroundColor: scoreBgColor(row.avgScore, colors) },
                        ]}
                      >
                        <Text
                          style={[
                            ss.efficiencyText,
                            { color: pillTextColor(row.avgScore, colors) },
                          ]}
                        >
                          {row.avgScore !== null ? `${row.avgScore}%` : '—'}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flex: 0.5, alignItems: 'flex-end', justifyContent: 'center' }}>
                      <MaterialCommunityIcons
                        name={trendIcon as any}
                        size={20}
                        color={trendColor}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>

        {/* ── SECTION 4: AI Recommendation ── */}
        <View style={[ss.section, { marginBottom: 0 }]}>
          <View style={ss.recCard}>
            <MaterialCommunityIcons
              name="lightbulb"
              size={32}
              color={colors.tertiary}
              style={{ marginTop: 2 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={ss.recTitle}>{t('insights.ai_recommendation')}</Text>
              <Text style={ss.recBody}>
                {recommendation
                  ? recommendation.content
                  : t('insights.complete_more')}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  if (id) return <SingleSessionInsights id={id} />;
  return <InsightsOverview />;
}

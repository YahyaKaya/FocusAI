import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter, useFocusEffect } from "expo-router";
import { useState, useCallback, useMemo } from "react";
import { useTheme } from "../../lib/ThemeContext";
import type { AppColors } from "../../lib/theme";
import { api } from "../../lib/api";
import i18n from '../../lib/i18n';

type Session = {
  id: string;
  session_type: string;
  actual_duration: number | null;
  productivity_score: number | null;
  start_time: string;
  status: string;
};

function formatCardDate(iso: string, t: (key: string) => string): string {
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
  if (isToday) return t("common.today").toUpperCase();
  if (isYesterday) return t("common.yesterday").toUpperCase();
  const locale = typeof t === 'function' ? (i18n.language === 'tr' ? 'tr-TR' : 'en-US') : 'en-US';
  return d
    .toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase()
    .replace(",", "");
}

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
    headerSection: {
      paddingHorizontal: 24,
      paddingTop: 40,
      paddingBottom: 8,
    },
    eyebrow: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    title: {
      fontSize: 36,
      fontWeight: '800',
      color: colors.onSurface,
      letterSpacing: -0.5,
      marginBottom: 16,
    },
    subtitle: {
      fontSize: 14,
      color: colors.onSurfaceVariant,
      lineHeight: 20,
      maxWidth: 280,
    },
    loadingRow: {
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingVertical: 64,
    },
    loadingText: {
      fontSize: 14,
      color: colors.onSurfaceVariant,
    },
    emptyRow: {
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingVertical: 64,
    },
    emptyIconCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    emptyTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.onSurface,
      marginBottom: 8,
      textAlign: 'center',
    },
    startBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 40,
      paddingVertical: 16,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    startBtnText: {
      color: colors.onPrimary,
      fontWeight: '700',
      fontSize: 15,
    },
    list: {
      paddingHorizontal: 24,
      paddingBottom: 8,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    dateText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.onSurfaceMuted,
      letterSpacing: 0.8,
    },
    scorePill: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      gap: 4,
    },
    scorePillIcon: {
      fontSize: 11,
    },
    scorePillText: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
    sessionTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.onSurface,
      marginBottom: 16,
      letterSpacing: -0.3,
    },
    chipsRow: {
      flexDirection: "row",
      gap: 12,
    },
    chip: {
      flex: 1,
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    chipLabel: {
      fontSize: 9,
      fontWeight: "700",
      color: colors.onSurfaceMuted,
      letterSpacing: 0.8,
      marginBottom: 4,
    },
    chipValue: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    chipIcon: {
      fontSize: 13,
    },
    chipValueText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.onSurface,
    },
  });
}

let _sessionsCache: any[] = [];
let _cacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

export default function HistoryScreen() {
  const { t } = useTranslation();
  const colors = useTheme();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const ss = useMemo(() => makeStyles(colors), [colors]);

  useFocusEffect(
    useCallback(() => {
      async function fetchSessions() {
        const now = Date.now();
        if (_sessionsCache.length > 0 && now - _cacheTime < CACHE_TTL) {
          setSessions(_sessionsCache);
          return;
        }
        setLoading(true);
        try {
          const data = await api.get<{ sessions: Session[] }>('/sessions');
          _sessionsCache = data.sessions;
          _cacheTime = Date.now();
          setSessions(data.sessions);
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      }
      fetchSessions();
    }, []),
  );

  async function deleteSession(id: string) {
    Alert.alert(
      t('history.delete_title'),
      t('history.delete_confirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('history.delete_button'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/sessions/${id}`);
              _cacheTime = 0;
              setSessions((prev) => prev.filter((s) => s.id !== id));
            } catch {
              Alert.alert(t('common.error'), t('common.error_retry'));
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={ss.headerSection}>
        <Text style={ss.eyebrow}>{t("history.historical_records")}</Text>
        <Text style={ss.title}>{t("history.title")}</Text>
        <Text style={ss.subtitle}>{t("history.description")}</Text>
      </View>

      {loading ? (
        <View style={ss.loadingRow}>
          <Text style={ss.loadingText}>{t("common.loading")}</Text>
        </View>
      ) : sessions.length === 0 ? (
        /* Empty State */
        <View style={ss.emptyRow}>
          <View style={ss.emptyIconCircle}>
            <Text style={{ fontSize: 48 }}>🚀</Text>
          </View>
          <Text style={ss.emptyTitle}>{t("history.no_sessions")}</Text>
          <TouchableOpacity
            style={[ss.startBtn, {
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: 6,
            }]}
            onPress={() => router.push("/(app)/pre-survey")}
            activeOpacity={0.85}
          >
            <Text style={{ color: colors.onPrimary, fontSize: 18 }}>▶</Text>
            <Text style={ss.startBtnText}>{t("home.start_session")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={ss.list}>
          {sessions.map((session) => {
            const score = session.productivity_score;
            const scoreRounded =
              score !== null ? Math.round(score * 10) / 10 : null;

            return (
              <TouchableOpacity key={session.id} style={ss.card} onPress={() => router.push(`/(app)/session-detail?id=${session.id}`)} activeOpacity={0.85}>
                {/* Top row: date + score pill */}
                <View style={ss.topRow}>
                  <Text style={ss.dateText}>
                    {formatCardDate(session.start_time, t)}
                  </Text>
                  {scoreRounded !== null && (
                    <View
                      style={[
                        ss.scorePill,
                        { backgroundColor: scoreBgColor(score, colors) },
                      ]}
                    >
                      <Text style={ss.scorePillIcon}>⭐</Text>
                      <Text
                        style={[
                          ss.scorePillText,
                          { color: scoreColor(score, colors) },
                        ]}
                      >
                        {scoreRounded}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => deleteSession(session.id)}
                    activeOpacity={0.7}
                    style={{ padding: 4 }}
                  >
                    <Text style={{ fontSize: 16, color: colors.error }}>🗑</Text>
                  </TouchableOpacity>
                </View>

                {/* Middle row: session title */}
                <Text style={ss.sessionTitle}>
                  {t(`session_types.${session.session_type}`) ?? t("session_types.OTHER")}
                </Text>

                {/* Bottom row: stat chips */}
                <View style={ss.chipsRow}>
                  <View style={ss.chip}>
                    <Text style={ss.chipLabel}>{t("history.duration_label")}</Text>
                    <View style={ss.chipValue}>
                      <Text style={ss.chipIcon}>🕐</Text>
                      <Text style={ss.chipValueText}>
                        {session.actual_duration != null
                          ? `${session.actual_duration} ${t("history.mins")}`
                          : "—"}
                      </Text>
                    </View>
                  </View>
                  <View style={ss.chip}>
                    <Text style={ss.chipLabel}>{t("history.efficiency_label")}</Text>
                    <View style={ss.chipValue}>
                      <Text style={ss.chipIcon}>📊</Text>
                      <Text
                        style={[
                          ss.chipValueText,
                          { color: scoreColor(score, colors) },
                        ]}
                      >
                        {scoreRounded !== null ? `${scoreRounded}%` : "—"}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

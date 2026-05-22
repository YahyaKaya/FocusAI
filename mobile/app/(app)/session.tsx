import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/ThemeContext";
import { api } from "../../lib/api";
import { useSessionContext } from '../../lib/SessionContext';
import { useSessionNotification } from "../../lib/useSessionNotification";

export default function SessionScreen() {
  const { t } = useTranslation();
  const colors = useTheme();
  const { id, sessionType: initialType, plannedDuration: plannedDurationParam } = useLocalSearchParams<{
    id: string;
    sessionType?: string;
    plannedDuration?: string;
  }>();
  const router = useRouter();

  const { endSession, activeSessionStart } = useSessionContext();
  const [status, setStatus] = useState<"ACTIVE" | "PAUSED">("ACTIVE");
  const sessionStart = activeSessionStart ?? Date.now();
  const startTimestampRef = useRef<number>(sessionStart);
  const pausedElapsedRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(() =>
    activeSessionStart ? Math.floor((Date.now() - activeSessionStart) / 1000) : 0
  );
  const [pauseCount, setPauseCount] = useState(0);
  const [sessionType, setSessionType] = useState<string>(initialType ?? "OTHER");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const plannedDuration = parseInt(plannedDurationParam ?? "0") || 0;

  useSessionNotification(sessionType, plannedDuration, elapsed, status === 'ACTIVE', activeSessionStart ?? undefined);

  const breakStartRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const isEndingRef = useRef(false);

  useEffect(() => {
    if (activeSessionStart) {
      startTimestampRef.current = activeSessionStart;
      pausedElapsedRef.current = 0;
      const initialElapsed = Math.floor((Date.now() - activeSessionStart) / 1000);
      setElapsed(initialElapsed);
      isEndingRef.current = false;

      // Restart the interval with the correct start time
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const totalElapsed = Math.floor((now - activeSessionStart) / 1000);
        setElapsed(totalElapsed);
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeSessionStart]);

  useEffect(() => {
    // Recalculate elapsed when app comes back to foreground
    const sub = AppState.addEventListener("change", (nextState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === "active" &&
        status === "ACTIVE"
      ) {
        const now = Date.now();
        const totalElapsed = pausedElapsedRef.current + Math.floor((now - startTimestampRef.current) / 1000);
        setElapsed(totalElapsed);
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [status]);

  useEffect(() => {
    if (status === "ACTIVE") {
      startTimestampRef.current = Date.now() - (elapsed - pausedElapsedRef.current) * 1000;
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const totalElapsed = pausedElapsedRef.current + Math.floor((now - startTimestampRef.current) / 1000);
        setElapsed(totalElapsed);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeDisplay = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  // Progress toward planned duration (0–1)
  const progress = plannedDuration > 0
    ? Math.min(elapsed / (plannedDuration * 60), 1)
    : 0;

  const ss = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 24,
      height: 64,
      backgroundColor: colors.surfaceContainerLow,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.onSurfaceVariant,
    },
    headerTimer: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.primary,
      letterSpacing: -0.5,
    },
    canvas: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingVertical: 8,
      borderRadius: 999,
      gap: 8,
      marginBottom: 48,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    pillText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.onTertiaryContainer,
      letterSpacing: 0.4,
    },
    timerCircle: {
      width: 288,
      height: 288,
      borderRadius: 144,
      backgroundColor: colors.surfaceContainerLowest,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 32,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.15,
      shadowRadius: 40,
      elevation: 8,
    },
    timerDigits: {
      fontSize: 72,
      fontWeight: "700",
      color: colors.onSurface,
      letterSpacing: -3,
    },
    timerSub: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.onSurfaceVariant,
      opacity: 0.6,
      marginTop: 8,
      letterSpacing: 3,
    },
    stats: { alignItems: "center", marginBottom: 32 },
    statPrimary: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.onSurfaceVariant,
      letterSpacing: 0.3,
    },
    statSub: {
      fontSize: 12,
      color: colors.onSurfaceVariant,
      opacity: 0.7,
      marginTop: 4,
      fontStyle: "italic",
    },
    progressRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 40,
      width: "100%",
      maxWidth: 320,
    },
    progressTrack: {
      flex: 1,
      height: 6,
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: 3,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      backgroundColor: colors.primary,
      borderRadius: 3,
    },
    progressLabel: {
      fontSize: 12,
      color: colors.onSurfaceVariant,
      fontWeight: "600",
      minWidth: 36,
      textAlign: "right",
    },
    typeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerLow,
      marginBottom: 24,
      width: "100%",
      maxWidth: 320,
    },
    typeLabel: { fontSize: 13, color: colors.onSurfaceVariant, fontWeight: "500" },
    typeValue: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
    actions: { width: "100%", maxWidth: 320, gap: 16 },
    btnSecondary: {
      height: 56,
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    btnSecondaryText: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
    btnPrimary: {
      height: 56,
      backgroundColor: colors.primary,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    btnPrimaryText: { fontSize: 16, fontWeight: "600", color: colors.onPrimary },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    modalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
    },
    modalTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface, marginBottom: 20 },
    modalOption: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceContainer,
    },
    modalOptionText: { fontSize: 16, color: colors.onSurface },
    modalOptionActive: { color: colors.primary, fontWeight: "700" },
  }), [colors]);

  const SESSION_TYPES = [
    { key: "READING", emoji: "📖", label: t("session_types.READING") },
    { key: "WRITING", emoji: "✍️", label: t("session_types.WRITING") },
    { key: "CODING", emoji: "💻", label: t("session_types.CODING") },
    { key: "TEST", emoji: "📝", label: t("session_types.TEST") },
    { key: "OTHER", emoji: "🎯", label: t("session_types.OTHER") },
  ];

  async function handlePause() {
    pausedElapsedRef.current = elapsed;
    await api.patch(`/sessions/${id}/pause`, {});
    setStatus("PAUSED");
    setPauseCount((p) => p + 1);
    breakStartRef.current = Date.now();
  }

  async function handleResume() {
    const breakMins = breakStartRef.current
      ? Math.round((Date.now() - breakStartRef.current) / 60000)
      : 0;
    await api.patch(`/sessions/${id}/resume`, { break_duration_mins: breakMins });
    breakStartRef.current = null;
    setStatus("ACTIVE");
  }

  async function handleTypeChange(newType: string) {
    setSessionType(newType);
    setShowTypePicker(false);
    try {
      await api.patch(`/sessions/${id}/type`, { session_type: newType });
    } catch (e) {
      console.error("Failed to update session type", e);
    }
  }

  async function handleEnd() {
    if (isEndingRef.current) return;
    isEndingRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    try {
      await api.patch(`/sessions/${id}/end`, {});
    } catch (e) {
      console.warn('End session error (continuing):', e);
    }
    endSession(id);
    router.push(`/(app)/post-survey?id=${id}&sessionType=${sessionType}&elapsed=${elapsed}`);
    setTimeout(() => { isEndingRef.current = false; }, 1000);
  }

  return (
    <SafeAreaView style={ss.root}>
      <StatusBar style={colors.statusBarStyle} />

      {/* Header */}
      <View style={ss.header}>
        <Text style={ss.headerTitle}>{t("session.active")}</Text>
        <Text style={ss.headerTimer}>{timeDisplay}</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Main canvas */}
      <View style={ss.canvas}>
        {/* Status pill */}
        <View style={[ss.pill, { backgroundColor: status === "ACTIVE" ? colors.tertiaryContainer : colors.surfaceContainerHigh }]}>
          <View style={[ss.dot, { backgroundColor: status === "ACTIVE" ? colors.primary : colors.outline }]} />
          <Text style={ss.pillText}>
            {status === "ACTIVE" ? t("session.active") : t("session.paused")}
          </Text>
        </View>

        {/* Circular timer */}
        <View style={ss.timerCircle}>
          <Text style={ss.timerDigits}>{timeDisplay}</Text>
          <Text style={ss.timerSub}>{t("session.elapsed").toUpperCase()}</Text>
        </View>

        {/* Stats */}
        <View style={ss.stats}>
          <Text style={ss.statPrimary}>{pauseCount} {t("session.breaks_taken")}</Text>
        </View>

        {/* Progress bar toward planned duration */}
        {plannedDuration > 0 && (
          <View style={ss.progressRow}>
            <View style={ss.progressTrack}>
              <View style={[ss.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={ss.progressLabel}>{plannedDuration}{t("home.mins")}</Text>
          </View>
        )}

        {/* Session Type Selector */}
        <TouchableOpacity style={ss.typeRow} onPress={() => setShowTypePicker(true)} activeOpacity={0.7}>
          <Text style={ss.typeLabel}>{t("session.session_type")}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={ss.typeValue}>
              {SESSION_TYPES.find((s) => s.key === sessionType)?.emoji}{" "}
              {SESSION_TYPES.find((s) => s.key === sessionType)?.label}
            </Text>
            <Text style={{ color: colors.onSurfaceVariant }}>›</Text>
          </View>
        </TouchableOpacity>

        {/* Type Picker Modal */}
        <Modal visible={showTypePicker} transparent animationType="slide" onRequestClose={() => setShowTypePicker(false)}>
          <TouchableOpacity style={ss.modalOverlay} activeOpacity={1} onPress={() => setShowTypePicker(false)}>
            <View style={ss.modalSheet}>
              <Text style={ss.modalTitle}>{t("session.change_type")}</Text>
              {SESSION_TYPES.map((type) => (
                <TouchableOpacity key={type.key} style={ss.modalOption} onPress={() => handleTypeChange(type.key)} activeOpacity={0.7}>
                  <Text style={[ss.modalOptionText, sessionType === type.key && ss.modalOptionActive]}>
                    {type.emoji} {type.label}
                  </Text>
                  {sessionType === type.key && <Text style={{ color: colors.primary }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Action buttons */}
        <View style={ss.actions}>
          {status === "ACTIVE" ? (
            <TouchableOpacity style={ss.btnSecondary} onPress={handlePause} activeOpacity={0.8}>
              <Text style={ss.btnSecondaryText}>{t("session.pause")}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={ss.btnSecondary} onPress={handleResume} activeOpacity={0.8}>
              <Text style={ss.btnSecondaryText}>{t("session.resume")}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={ss.btnPrimary} onPress={handleEnd} activeOpacity={0.85}>
            <Text style={ss.btnPrimaryText}>{t("session.end")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

import { View, Text, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import i18n from "../../lib/i18n";
import { useThemeContext } from "../../lib/ThemeContext";
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { api } from '../../lib/api';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const [language, setLanguage] = useState(i18n.language);
  const { mode, setMode } = useThemeContext();
  const isDark = mode === "dark";
  const [userEmail, setUserEmail] = useState<string>('');
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserEmail(session.user.email ?? '');
        const meta = session.user.user_metadata;
        setUserName(meta?.full_name ?? meta?.name ?? '');
      }
    });
  }, []);

  async function toggleLanguage(lang: string) {
    i18n.changeLanguage(lang);
    setLanguage(lang);
    await AsyncStorage.setItem("user_language", lang);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  async function exportData() {
    try {
      const res = await api.get<{ sessions: any[] }>('/sessions');
      const sessions = res.sessions ?? [];
      if (sessions.length === 0) {
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
      Alert.alert(t('common.error'), err?.message ?? t('common.error_retry'));
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-surface dark:bg-[#0f1a14]"
      contentContainerClassName="pb-12"
      showsVerticalScrollIndicator={false}
    >
      {/* Editorial Header */}
      <View className="px-6 pt-12 pb-14">
        <Text className="text-5xl font-extrabold text-on-surface dark:text-[#e8f0eb] tracking-tight mb-2">
          {t("settings.title")}
        </Text>
        <Text className="text-on-surface-variant dark:text-[#9ab0a0] text-lg">
          {t("settings.configure")}
        </Text>
      </View>

      <View className="px-6 space-y-10">
        {/* Account Details Section */}
        <View className="mb-6">
          <View className="flex-row items-center gap-3 mb-5">
            <Text className="text-primary dark:text-[#4ade80] text-xl">👤</Text>
            <Text className="text-xl font-bold text-on-surface dark:text-[#e8f0eb]">
              {t("settings.account_details")}
            </Text>
          </View>
          <View className="bg-surface-container-lowest dark:bg-[#0a1510] rounded-xl overflow-hidden">
            <View className="px-5 py-4 border-b border-outline-variant/10">
              <Text className="text-xs font-bold text-on-surface-variant dark:text-[#9ab0a0] uppercase tracking-wider mb-1">
                {t("settings.name")}
              </Text>
              <Text className="text-on-surface dark:text-[#e8f0eb] font-medium text-base">
                {userName || t("settings.not_set")}
              </Text>
            </View>
            <View className="px-5 py-4">
              <Text className="text-xs font-bold text-on-surface-variant dark:text-[#9ab0a0] uppercase tracking-wider mb-1">
                {t("settings.email")}
              </Text>
              <Text className="text-on-surface dark:text-[#e8f0eb] font-medium text-base">
                {userEmail || t("settings.not_set")}
              </Text>
            </View>
          </View>
        </View>

        {/* Account Security Section */}
        <View className="mb-10">
          <View className="flex-row items-center gap-3 mb-5">
            <Text className="text-primary dark:text-[#4ade80] text-xl">🛡</Text>
            <Text className="text-xl font-bold text-on-surface dark:text-[#e8f0eb]">
              {t("settings.account_security")}
            </Text>
          </View>
          <View className="gap-2">
            <TouchableOpacity className="flex-row items-center justify-between p-5 bg-surface-container-lowest dark:bg-[#0a1510] rounded-xl">
              <Text className="font-medium text-on-surface dark:text-[#e8f0eb]">
                {t("settings.change_password")}
              </Text>
              <Text className="text-on-surface-variant dark:text-[#9ab0a0] text-lg">›</Text>
            </TouchableOpacity>
            <TouchableOpacity className="flex-row items-center justify-between p-5 bg-surface-container-lowest dark:bg-[#0a1510] rounded-xl">
              <View>
                <Text className="font-medium text-on-surface dark:text-[#e8f0eb]">
                  {t("settings.two_factor")}
                </Text>
                <Text className="text-xs text-on-surface-variant dark:text-[#9ab0a0] mt-0.5">
                  {t("settings.two_factor_desc")}
                </Text>
              </View>
              <View className="flex-row items-center gap-3">
                <View className="px-2 py-0.5 bg-primary-container dark:bg-[#1a3d2a] rounded-full">
                  <Text className="text-xs font-bold text-primary dark:text-[#4ade80]">
                    {t("settings.enabled")}
                  </Text>
                </View>
                <Text className="text-on-surface-variant dark:text-[#9ab0a0] text-lg">›</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* App Preferences Section */}
        <View className="mb-10">
          <View className="flex-row items-center gap-3 mb-5">
            <Text className="text-primary dark:text-[#4ade80] text-xl">⚙</Text>
            <Text className="text-xl font-bold text-on-surface dark:text-[#e8f0eb]">
              {t("settings.app_preferences")}
            </Text>
          </View>
          <View className="bg-surface-container-low dark:bg-[#1e2d24] rounded-xl overflow-hidden">
            {/* Language Toggle */}
            <View className="p-5 border-b border-outline-variant/10">
              <Text className="text-xs font-bold text-on-surface-variant dark:text-[#9ab0a0] uppercase tracking-wider mb-3">
                {t("settings.language")}
              </Text>
              <View className="flex-row gap-3">
                <TouchableOpacity
                  className={`flex-1 h-11 rounded-xl items-center justify-center ${
                    language === "en"
                      ? "bg-primary dark:bg-[#4ade80]"
                      : "bg-surface-container-high dark:bg-[#243320]"
                  }`}
                  onPress={() => toggleLanguage("en")}
                  activeOpacity={0.7}
                >
                  <Text
                    className={`font-semibold text-sm ${
                      language === "en"
                        ? "text-on-primary dark:text-[#0a1f12]"
                        : "text-on-surface dark:text-[#e8f0eb]"
                    }`}
                  >
                    {t("settings.english")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`flex-1 h-11 rounded-xl items-center justify-center ${
                    language === "tr"
                      ? "bg-primary dark:bg-[#4ade80]"
                      : "bg-surface-container-high dark:bg-[#243320]"
                  }`}
                  onPress={() => toggleLanguage("tr")}
                  activeOpacity={0.7}
                >
                  <Text
                    className={`font-semibold text-sm ${
                      language === "tr"
                        ? "text-on-primary dark:text-[#0a1f12]"
                        : "text-on-surface dark:text-[#e8f0eb]"
                    }`}
                  >
                    {t("settings.turkish")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Theme toggle */}
            <View className="p-5 border-b border-outline-variant/10">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="font-medium text-on-surface dark:text-[#e8f0eb]">{t("settings.theme")}</Text>
                <View className="flex-row p-1 bg-surface-container-high dark:bg-[#243320] rounded-lg gap-1">
                  <TouchableOpacity
                    className={`px-3 py-1 rounded-md ${
                      !isDark
                        ? "bg-surface-container-lowest dark:bg-[#0a1510]"
                        : ""
                    }`}
                    onPress={() => setMode("light")}
                    activeOpacity={0.7}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        !isDark
                          ? "text-primary dark:text-[#4ade80]"
                          : "text-on-surface-variant dark:text-[#9ab0a0]"
                      }`}
                    >
                      {t("settings.theme_light")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className={`px-3 py-1 rounded-md ${
                      isDark
                        ? "bg-surface-container-lowest dark:bg-[#0a1510]"
                        : ""
                    }`}
                    onPress={() => setMode("dark")}
                    activeOpacity={0.7}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isDark
                          ? "text-primary dark:text-[#4ade80]"
                          : "text-on-surface-variant dark:text-[#9ab0a0]"
                      }`}
                    >
                      {t("settings.theme_dark")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Focus Mode Sounds */}
            <TouchableOpacity className="flex-row items-center justify-between p-5">
              <Text className="font-medium text-on-surface dark:text-[#e8f0eb]">
                {t("settings.focus_sounds")}
              </Text>
              <Text className="text-sm text-on-surface-variant dark:text-[#9ab0a0] font-medium">
                {t("settings.binaural_waves")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Data & Privacy Section */}
        <View className="mb-10">
          <View className="flex-row items-center gap-3 mb-5">
            <Text className="text-primary dark:text-[#4ade80] text-xl">🔒</Text>
            <Text className="text-xl font-bold text-on-surface dark:text-[#e8f0eb]">
              {t("settings.data_privacy")}
            </Text>
          </View>
          <View className="gap-2">
            <TouchableOpacity className="flex-row items-center justify-between p-5 bg-surface-container-lowest dark:bg-[#0a1510] rounded-xl" onPress={exportData}>
              <View>
                <Text className="font-medium text-on-surface dark:text-[#e8f0eb]">
                  {t("settings.export_my_data")}
                </Text>
                <Text className="text-xs text-on-surface-variant dark:text-[#9ab0a0] mt-0.5">
                  {t("settings.export_desc")}
                </Text>
              </View>
              <Text className="text-on-surface-variant dark:text-[#9ab0a0] text-lg">↓</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="flex-row items-center justify-between p-5 bg-surface-container-lowest dark:bg-[#0a1510] rounded-xl border border-error-container/20"
              onPress={handleLogout}
              activeOpacity={0.8}
            >
              <Text className="font-semibold text-error dark:text-[#ff8a80]">
                {t("auth.logout")}
              </Text>
              <Text className="text-error dark:text-[#ff8a80] opacity-60 text-lg">🗑</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Support & Info */}
        <View className="pt-4 border-t border-outline-variant/20 mb-6">
          <View className="flex-row gap-4 mb-8">
            <TouchableOpacity className="flex-1 flex-row items-center gap-4 p-5 bg-surface-container-low dark:bg-[#1e2d24] rounded-xl">
              <View className="w-10 h-10 bg-surface-container-lowest dark:bg-[#0a1510] rounded-lg items-center justify-center">
                <Text className="text-primary dark:text-[#4ade80] text-lg">?</Text>
              </View>
              <View>
                <Text className="font-bold text-on-surface dark:text-[#e8f0eb] text-sm">
                  {t("settings.help_center")}
                </Text>
                <Text className="text-xs text-on-surface-variant dark:text-[#9ab0a0]">
                  {t("settings.help_desc")}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity className="flex-1 flex-row items-center gap-4 p-5 bg-surface-container-low dark:bg-[#1e2d24] rounded-xl">
              <View className="w-10 h-10 bg-surface-container-lowest dark:bg-[#0a1510] rounded-lg items-center justify-center">
                <Text className="text-primary dark:text-[#4ade80] text-lg">📄</Text>
              </View>
              <View>
                <Text className="font-bold text-on-surface dark:text-[#e8f0eb] text-sm">
                  {t("settings.terms")}
                </Text>
                <Text className="text-xs text-on-surface-variant dark:text-[#9ab0a0]">
                  {t("settings.terms_desc")}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Version Pill */}
          <View className="items-center">
            <View className="flex-row items-center gap-2 px-4 py-2 bg-surface-container-highest dark:bg-[#2a3d2a] rounded-full">
              <View className="w-2 h-2 rounded-full bg-primary dark:bg-[#4ade80]" />
              <Text className="text-xs font-bold uppercase tracking-widest text-on-surface-variant dark:text-[#9ab0a0]">
                {t("settings.version")}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

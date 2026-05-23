import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../../lib/ThemeContext";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SessionBanner } from '../../components/SessionBanner';

export default function AppLayout() {
  const { t } = useTranslation();
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <View style={{ backgroundColor: colors.surface }}>
        <SessionBanner />
      </View>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.surfaceContainerLow,
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
            height: 64 + insets.bottom,
            paddingBottom: 8 + insets.bottom,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.onSurfaceVariant,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarLabel: ({ color }) => (
              <Text style={{ color, fontSize: 11 }}>{t("home.tab_label")}</Text>
            ),
            tabBarIcon: ({ color, focused }) => (
              <MaterialCommunityIcons
                name={focused ? "home" : "home-outline"}
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            tabBarLabel: ({ color }) => (
              <Text style={{ color, fontSize: 11 }}>{t("history.tab_label")}</Text>
            ),
            tabBarIcon: ({ color, focused }) => (
              <MaterialCommunityIcons
                name={focused ? "clock" : "clock-outline"}
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="insights"
          options={{
            tabBarLabel: ({ color }) => (
              <Text style={{ color, fontSize: 11 }}>{t("insights.title")}</Text>
            ),
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons
                name="chart-bar"
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            tabBarLabel: ({ color }) => (
              <Text style={{ color, fontSize: 11 }}>{t("settings.title")}</Text>
            ),
            tabBarIcon: ({ color, focused }) => (
              <MaterialCommunityIcons
                name={focused ? "cog" : "cog-outline"}
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen name="session-detail" options={{ href: null }} />
        <Tabs.Screen name="pre-survey" options={{ href: null }} />
        <Tabs.Screen name="quick-start" options={{ href: null }} />
        <Tabs.Screen name="session" options={{ href: null }} />
        <Tabs.Screen name="post-survey" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

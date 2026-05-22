// CRITICAL: Import URL polyfill FIRST before any network calls
import "react-native-url-polyfill/auto";

import "../global.css";
import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, Text, ActivityIndicator } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { initI18n } from "../lib/i18n";
import { ThemeProvider, useThemeContext } from "../lib/ThemeContext";
import { SessionProvider } from '../lib/SessionContext';

// Import supabase and api AFTER polyfill to ensure they have proper fetch
let supabase: any;
let api: any;
let supabaseError: Error | null = null;
let apiError: Error | null = null;

try {
  const supabaseModule = require("../lib/supabase");
  supabase = supabaseModule.supabase;
} catch (error) {
  supabaseError = error instanceof Error ? error : new Error(String(error));
  console.error("Failed to initialize Supabase:", supabaseError);
}

try {
  const apiModule = require("../lib/api");
  api = apiModule.api;
} catch (error) {
  apiError = error instanceof Error ? error : new Error(String(error));
  console.error("Failed to initialize API:", apiError);
}

function RootLayoutNav({ session }: { session: Session | null }) {
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useThemeContext();

  useEffect(() => {
    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (session && inAuthGroup) {
      router.replace("/(app)");
    }
  }, [session, segments]);

  return (
    <>
      <StatusBar style={colors.statusBarStyle} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

function ErrorScreen({ error, title }: { error: Error; title: string }) {
  return (
    <View className="flex-1 bg-surface justify-center items-center px-6">
      <Text className="text-2xl font-bold text-primary mb-4 text-center">
        {title}
      </Text>
      <Text className="text-base text-on-surface mb-6 text-center leading-6">
        {error.message}
      </Text>
      <Text className="text-sm text-on-surface-variant text-center">
        Please check your environment variables and EAS build configuration.
      </Text>
    </View>
  );
}

function LoadingScreen() {
  return (
    <View className="flex-1 bg-surface justify-center items-center">
      <ActivityIndicator size="large" color="#2c694e" />
      <Text className="text-on-surface mt-4">Initializing app...</Text>
    </View>
  );
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [i18nReady, setI18nReady] = useState(false);
  const [startupError, setStartupError] = useState<Error | null>(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Check for critical initialization errors
        if (supabaseError) {
          throw supabaseError;
        }
        if (apiError) {
          // API errors are non-critical - app can still work in auth screens
          console.warn("API initialization warning:", apiError.message);
        }

        // Initialize i18n
        try {
          await initI18n();
          setI18nReady(true);
        } catch (error) {
          console.warn("i18n initialization failed:", error);
          setI18nReady(true); // Don't block app on i18n error
        }

        // Get auth session
        const {
          data: { session: currentSession },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        setSession(currentSession);

        // Sync with backend if authenticated
        if (currentSession && api) {
          try {
            await api.post("/auth/sync", {});
          } catch (error) {
            console.warn("Failed to sync auth with backend:", error);
            // Don't block on sync failure
          }
        }

        setInitialized(true);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error("App initialization failed:", err);
        setStartupError(err);
        setInitialized(true); // Still mark as initialized so we show the error
      }
    };

    initializeApp();

    // Subscribe to auth state changes
    if (supabase) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(
        async (_event: string, newSession: Session | null) => {
          setSession(newSession);
          if (newSession && api) {
            try {
              await api.post("/auth/sync", {});
            } catch (error) {
              console.warn("Failed to sync auth state:", error);
            }
          }
        },
      );

      return () => subscription?.unsubscribe();
    }
  }, []);

  // Show critical initialization errors
  if (startupError) {
    return <ErrorScreen error={startupError} title="Initialization Error" />;
  }

  if (supabaseError) {
    return (
      <ErrorScreen error={supabaseError} title="Supabase Configuration Error" />
    );
  }

  if (!initialized || !i18nReady) {
    return <LoadingScreen />;
  }

  return (
    <ThemeProvider>
      <SessionProvider>
        <RootLayoutNav session={session} />
      </SessionProvider>
    </ThemeProvider>
  );
}

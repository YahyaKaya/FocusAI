import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useTranslation } from "react-i18next";

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View className="flex-1 justify-center px-8">
        <Text className="font-bold text-4xl text-primary mb-2">
          {t("common.app_name")}
        </Text>
        <Text className="text-on-surface-variant text-base mb-12">
          {t("auth.login")}
        </Text>

        <View className="gap-4">
          <View>
            <Text className="text-sm text-on-surface-variant mb-2">
              {t("auth.email")}
            </Text>
            <TextInput
              className="bg-surface-container-lowest rounded-xl px-4 h-14 text-on-surface"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholderTextColor="#586064"
            />
          </View>

          <View>
            <Text className="text-sm text-on-surface-variant mb-2">
              {t("auth.password")}
            </Text>
            <TextInput
              className="bg-surface-container-lowest rounded-xl px-4 h-14 text-on-surface"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              placeholderTextColor="#586064"
            />
          </View>

          {error && <Text className="text-error text-sm">{error}</Text>}

          <TouchableOpacity
            className="bg-primary h-14 rounded-xl items-center justify-center mt-4"
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#e1ffec" />
            ) : (
              <Text className="text-on-primary font-semibold text-base">
                {t("auth.login")}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className="items-center mt-4"
            onPress={() => router.push("/(auth)/register")}
          >
            <Text className="text-on-surface-variant text-sm">
              {t("auth.no_account")}{" "}
              <Text className="text-primary font-semibold">
                {t("auth.register")}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

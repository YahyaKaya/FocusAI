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

export default function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleRegister() {
    if (!name.trim()) { setError(t('auth.name_required')); return; }
    if (!email.trim()) { setError(t('auth.email_required')); return; }
    if (password.length < 6) { setError(t('auth.password_too_short')); return; }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  }

  if (success) {
    return (
      <View className="flex-1 bg-surface justify-center items-center px-8">
        <Text style={{ fontSize: 48, marginBottom: 24 }}>📬</Text>
        <Text className="font-bold text-2xl text-on-surface text-center mb-4">
          {t('auth.check_email')}
        </Text>
        <Text className="text-on-surface-variant text-base text-center mb-12 leading-relaxed">
          {t('auth.confirmation_sent', { email })}
        </Text>
        <TouchableOpacity
          className="bg-primary h-14 rounded-xl items-center justify-center w-full"
          onPress={() => router.replace('/(auth)/login')}
        >
          <Text className="text-on-primary font-semibold text-base">
            {t('auth.go_to_login')}
          </Text>
        </TouchableOpacity>
      </View>
    );
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
          {t("auth.create_account")}
        </Text>
        <View className="gap-4">
          <View>
            <Text className="text-sm text-on-surface-variant mb-2">{t("auth.name")}</Text>
            <TextInput
              className="bg-surface-container-lowest rounded-xl px-4 h-14 text-on-surface"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
              placeholder={t("auth.name_placeholder")}
              placeholderTextColor="#586064"
            />
          </View>
          <View>
            <Text className="text-sm text-on-surface-variant mb-2">{t("auth.email")}</Text>
            <TextInput
              className="bg-surface-container-lowest rounded-xl px-4 h-14 text-on-surface"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder={t("auth.email_placeholder")}
              placeholderTextColor="#586064"
            />
          </View>
          <View>
            <Text className="text-sm text-on-surface-variant mb-2">{t("auth.password")}</Text>
            <TextInput
              className="bg-surface-container-lowest rounded-xl px-4 h-14 text-on-surface"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              placeholder={t("auth.password_placeholder")}
              placeholderTextColor="#586064"
            />
            <Text className="text-xs text-on-surface-variant mt-1 ml-1">{t("auth.password_hint")}</Text>
          </View>
          {error && <Text className="text-error text-sm">{error}</Text>}
          <TouchableOpacity
            className="bg-primary h-14 rounded-xl items-center justify-center mt-4"
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#e1ffec" />
            ) : (
              <Text className="text-on-primary font-semibold text-base">{t("auth.register")}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity className="items-center mt-4" onPress={() => router.back()}>
            <Text className="text-on-surface-variant text-sm">
              {t("auth.have_account")}{" "}
              <Text className="text-primary font-semibold">{t("auth.login")}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

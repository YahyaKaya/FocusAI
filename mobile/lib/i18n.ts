import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "../locales/en.json";
import tr from "../locales/tr.json";

export const defaultLanguage = "en";
export const supportedLanguages = ["en", "tr"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

const LANGUAGE_KEY = "user_language";

i18n.use(initReactI18next);

export async function initI18n(): Promise<void> {
  const saved = await AsyncStorage.getItem(LANGUAGE_KEY).catch(() => null);
  const lng = saved && supportedLanguages.includes(saved as SupportedLanguage)
    ? saved
    : defaultLanguage;

  await i18n.init({
    compatibilityJSON: "v4",
    resources: {
      en: { translation: en },
      tr: { translation: tr },
    },
    lng,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });
}

export default i18n;

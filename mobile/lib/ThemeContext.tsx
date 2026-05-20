import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'nativewind';
import { lightColors, darkColors, AppColors } from './theme';

type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: AppColors;
  setMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  colors: lightColors,
  setMode: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const { setColorScheme } = useColorScheme();

  useEffect(() => {
    // Set light as default immediately
    setColorScheme('light');
    // Then check if user had a saved preference
    AsyncStorage.getItem('app_theme').then((saved) => {
      if (saved === 'dark' || saved === 'light') {
        setModeState(saved);
        setColorScheme(saved);
      }
    }).catch(() => {});
  }, []);

  async function setMode(newMode: ThemeMode) {
    setModeState(newMode);
    setColorScheme(newMode);
    await AsyncStorage.setItem('app_theme', newMode);
  }

  return (
    <ThemeContext.Provider value={{ mode, colors: mode === 'dark' ? darkColors : lightColors, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  return useContext(ThemeContext);
}

export function useTheme(): AppColors {
  return useThemeContext().colors;
}

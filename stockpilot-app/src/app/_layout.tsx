import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { migrate } from '@/db/schema';
import { AppProvider, useApp } from '@/state/app';

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { ready, onboarded, t } = useApp();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerTransparent: true, headerBlurEffect: 'systemMaterial' }}>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="item/[id]" options={{ title: '' }} />
        <Stack.Screen
          name="item/new"
          options={{ presentation: 'formSheet', title: t('items.add'), sheetGrabberVisible: true, sheetAllowedDetents: [0.9] }}
        />
        <Stack.Screen name="assistant" options={{ presentation: 'modal', title: t('assistant.title') }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', title: '' }} />
        <Stack.Screen name="review" options={{ presentation: 'modal', title: t('capture.review') }} />
        <Stack.Screen
          name="voice"
          options={{ presentation: 'formSheet', title: t('voice.title'), sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SQLiteProvider databaseName="stockpilot.db" onInit={migrate}>
        <AppProvider>
          <RootStack />
        </AppProvider>
      </SQLiteProvider>
    </ThemeProvider>
  );
}

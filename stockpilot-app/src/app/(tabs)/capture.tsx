import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alertAiError, alertQuota, countShelf, prepareImage, readInvoice } from '@/ai/client';
import { fromInvoice, fromShelf, setPendingReview } from '@/ai/review';
import { Button, Muted, breathing } from '@/components/ui';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { findByBarcode, listItems } from '@/db/repo';
import { useTheme } from '@/hooks/use-theme';
import type { MessageKey } from '@/lib/i18n';
import { canUseAi } from '@/lib/plans';
import { useApp } from '@/state/app';

type Mode = 'shelf' | 'invoice' | 'barcode';
const MODES: { id: Mode; label: MessageKey }[] = [
  { id: 'shelf', label: 'capture.shelf' },
  { id: 'invoice', label: 'capture.invoice' },
  { id: 'barcode', label: 'capture.barcode' },
];

export default function Capture() {
  const db = useSQLiteContext();
  const app = useApp();
  const { t } = app;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const [mode, setMode] = useState<Mode>(params.mode ?? 'shelf');
  // Follow deep links from Home (e.g. "scan a delivery note") without an effect.
  const [lastParam, setLastParam] = useState(params.mode);
  if (params.mode !== lastParam) {
    setLastParam(params.mode);
    if (params.mode) setMode(params.mode);
  }
  const [busy, setBusy] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const scanLock = useRef(false);

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Muted>{t('capture.permission')}</Muted>
        <Button label={t('capture.allow')} icon="camera" onPress={requestPermission} />
      </View>
    );
  }

  const shoot = async () => {
    if (!camera.current || busy) return;
    if (!canUseAi(app.plan, app.aiUsed)) {
      alertQuota(t);
      return;
    }
    setBusy(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const image = await prepareImage(photo.uri, photo.width, photo.height);
      const items = await listItems(db);
      const ctx = {
        deviceId: app.deviceId,
        locale: app.locale,
        industry: app.industry.id,
        knownItems: items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, variant: i.variant })),
      };
      if (mode === 'shelf') {
        const result = await countShelf(ctx, image);
        setPendingReview({ source: 'shelf_ai', title: t('capture.shelf'), rows: fromShelf(result), supplier: null, clarification: null });
      } else {
        const result = await readInvoice(ctx, image);
        setPendingReview({
          source: 'invoice_ai',
          title: result.supplier ?? t('capture.invoice'),
          rows: fromInvoice(result),
          supplier: result.supplier,
          clarification: null,
        });
      }
      await app.noteAiUse();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push('/review');
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      alertAiError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const onBarcode = async (result: BarcodeScanningResult) => {
    if (scanLock.current) return;
    scanLock.current = true;
    Haptics.selectionAsync();
    const item = await findByBarcode(db, result.data);
    if (item) {
      router.push({ pathname: '/item/[id]', params: { id: item.id } });
      setTimeout(() => (scanLock.current = false), 1500);
    } else {
      Alert.alert(t('capture.unknownBarcode', { code: result.data }), undefined, [
        { text: t('common.cancel'), style: 'cancel', onPress: () => (scanLock.current = false) },
        {
          text: t('items.add'),
          onPress: () => {
            scanLock.current = false;
            router.push({ pathname: '/item/new', params: { barcode: result.data } });
          },
        },
      ]);
    }
  };

  return (
    <View style={styles.root}>
      {focused ? (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          active={focused}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr', 'datamatrix'] }}
          onBarcodeScanned={mode === 'barcode' ? onBarcode : undefined}
        />
      ) : null}

      <View style={[styles.modes, { top: insets.top + Spacing.two }]}>
        {MODES.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => {
              Haptics.selectionAsync();
              setMode(m.id);
            }}
            style={[styles.mode, mode === m.id && { backgroundColor: 'rgba(255,255,255,0.95)' }]}>
            <Text style={[styles.modeText, { color: mode === m.id ? '#000' : '#fff' }]}>{t(m.label)}</Text>
          </Pressable>
        ))}
      </View>

      {mode === 'barcode' ? (
        <View pointerEvents="none" style={styles.reticleWrap}>
          <View style={styles.reticle} />
        </View>
      ) : null}

      {busy ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.busy}>
          <Animated.Text style={[styles.busyText, breathing]}>{t('capture.thinking')}</Animated.Text>
        </Animated.View>
      ) : null}

      {mode !== 'barcode' ? (
        <View style={[styles.shutterWrap, { bottom: insets.bottom + BottomTabInset + Spacing.four }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('capture.shoot')}
            onPress={shoot}
            disabled={busy}
            style={({ pressed }) => [styles.shutter, { transform: [{ scale: pressed || busy ? 0.9 : 1 }] }]}>
            <View style={styles.shutterInner} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  modes: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: Spacing.one,
    padding: Spacing.one,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  mode: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.pill },
  modeText: { fontWeight: '700', fontSize: 14 },
  reticleWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  reticle: { width: 260, height: 160, borderRadius: Radius.md, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  busy: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  busyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  shutterWrap: { position: 'absolute', alignSelf: 'center' },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
});

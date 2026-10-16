import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

const ID = 'stock-morning-alert';

function nextMorning(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(9, 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Keep exactly one "tomorrow 9:00" reminder in sync with what needs ordering.
 * Called whenever forecasts load, so it always reflects the latest stock.
 */
export async function syncMorningAlert(title: string, body: string | null): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(ID);
    if (!body) {
      await Notifications.setBadgeCountAsync(0);
      return;
    }
    const perm = await Notifications.getPermissionsAsync();
    const granted = perm.granted || (perm.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!granted) return;
    await Notifications.scheduleNotificationAsync({
      identifier: ID,
      content: { title, body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nextMorning() },
    });
  } catch {
    // Notifications are a convenience; never block the app on them.
  }
}

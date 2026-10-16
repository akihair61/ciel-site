import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import { getForecasts, type ItemWithForecast } from '@/db/repo';
import { useApp } from '@/state/app';

/** All items with their forecast; reloads on focus and after stock changes. */
export function useForecasts() {
  const db = useSQLiteContext();
  const { industry, version } = useApp();
  const [data, setData] = useState<ItemWithForecast[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getForecasts(db, industry).then((rows) => alive && setData(rows));
      return () => {
        alive = false;
      };
      // `version` is a refresh signal bumped after stock changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, industry, version]),
  );

  return data;
}

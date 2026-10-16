import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'expo-symbols';
import type { ColorValue } from 'react-native';

/** SF Symbols on iOS, Material Symbols on Android and web. */
const ICONS = {
  camera: { ios: 'camera', android: 'photo_camera' },
  plus: { ios: 'plus', android: 'add' },
  chevron: { ios: 'chevron.right', android: 'chevron_right' },
  shelf: { ios: 'camera.viewfinder', android: 'center_focus_strong' },
  invoice: { ios: 'doc.text.viewfinder', android: 'document_scanner' },
  voice: { ios: 'waveform', android: 'graphic_eq' },
  ai: { ios: 'sparkles', android: 'auto_awesome' },
  check: { ios: 'checkmark', android: 'check' },
  send: { ios: 'paperplane.fill', android: 'send' },
  next: { ios: 'arrow.right', android: 'arrow_forward' },
  demo: { ios: 'wand.and.stars', android: 'auto_fix_high' },
  checked: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  unchecked: { ios: 'circle', android: 'radio_button_unchecked' },
  edit: { ios: 'pencil', android: 'edit' },
  trash: { ios: 'trash', android: 'delete' },
  stop: { ios: 'stop.fill', android: 'stop' },
  mic: { ios: 'mic.fill', android: 'mic' },
  up: { ios: 'arrow.up', android: 'arrow_upward' },
  food: { ios: 'fork.knife', android: 'restaurant' },
  salon: { ios: 'scissors', android: 'content_cut' },
  retail: { ios: 'bag', android: 'shopping_bag' },
  fashion: { ios: 'tshirt', android: 'checkroom' },
  pharmacy: { ios: 'cross.case', android: 'medical_services' },
  other: { ios: 'square.grid.2x2', android: 'apps' },
} as const satisfies Record<string, { ios: SFSymbol; android: string }>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: ColorValue }) {
  const { ios, android } = ICONS[name];
  return <SymbolView name={{ ios, android, web: android }} size={size} tintColor={color} />;
}

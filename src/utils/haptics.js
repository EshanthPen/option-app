import { Platform, Vibration } from 'react-native';

const isWeb = Platform.OS === 'web';

/**
 * Light haptic feedback for button taps and minor interactions.
 */
export function lightImpact() {
  if (isWeb) return;
  Vibration.vibrate(10);
}

/**
 * Medium haptic feedback for completing tasks, toggling switches.
 */
export function mediumImpact() {
  if (isWeb) return;
  Vibration.vibrate(25);
}

/**
 * Heavy haptic feedback for important actions (deleting, achievements unlocked).
 */
export function heavyImpact() {
  if (isWeb) return;
  Vibration.vibrate(50);
}

/**
 * Success notification pattern for completing pomodoros, getting good grades.
 */
export function successNotification() {
  if (isWeb) return;
  Vibration.vibrate([0, 30, 60, 30]);
}

/**
 * Error notification pattern for failures.
 */
export function errorNotification() {
  if (isWeb) return;
  Vibration.vibrate([0, 50, 100, 50, 100, 50]);
}

/**
 * Light feedback for picker/selector changes.
 */
export function selectionChanged() {
  if (isWeb) return;
  Vibration.vibrate(5);
}

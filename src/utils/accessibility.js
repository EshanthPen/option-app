import { Platform, PixelRatio } from 'react-native';

/**
 * Returns base accessibility props with a label and optional hint.
 */
export function a11yProps(label, hint) {
  const props = {
    accessible: true,
    accessibilityLabel: label,
  };
  if (hint) {
    props.accessibilityHint = hint;
  }
  return props;
}

/**
 * Accessibility props for a button element.
 */
export function a11yButton(label, hint) {
  return {
    ...a11yProps(label, hint),
    accessibilityRole: 'button',
  };
}

/**
 * Accessibility props for a header element.
 */
export function a11yHeader(label) {
  return {
    ...a11yProps(label),
    accessibilityRole: 'header',
  };
}

/**
 * Accessibility props for an image element.
 */
export function a11yImage(label) {
  return {
    ...a11yProps(label),
    accessibilityRole: 'image',
  };
}

/**
 * Accessibility props for a toggle switch.
 */
export function a11yToggle(label, isOn) {
  return {
    ...a11yProps(label),
    accessibilityRole: 'switch',
    accessibilityState: { checked: isOn },
  };
}

/**
 * Returns a font size scaled according to the user's accessibility text size
 * preference. On web, returns the base size unchanged.
 */
export function scaledFontSize(baseSize) {
  if (Platform.OS === 'web') {
    return baseSize;
  }
  const scale = PixelRatio.getFontScale();
  return Math.round(baseSize * scale);
}

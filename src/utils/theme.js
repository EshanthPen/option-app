export const colors = {
    light: {
        bg: '#f8f9fa',
        surface: '#ffffff',
        surface2: '#f1f3f5',
        border: '#dee2e6',
        border2: '#ced4da',
        ink: '#1a1b1e',
        ink2: '#495057',
        ink3: '#adb5bd',
        ink4: '#e9ecef',
        red: '#e03131',
        orange: '#f76707',
        green: '#2f9e44',
        blue: '#1971c2',
        purple: '#7048e8',
        accent: '#228be6',
    },
    dark: {
        bg: '#1a1b1e',
        surface: '#25262b',
        surface2: '#2c2e33',
        border: '#373a40',
        border2: '#5c5f66',
        ink: '#f8f9fa',
        ink2: '#ced4da',
        ink3: '#909296',
        ink4: '#373a40',
        red: '#ff6b6b',
        orange: '#ff922b',
        green: '#51cf66',
        blue: '#4dabf7',
        purple: '#b197fc',
        accent: '#339af0',
    }
};

export const getTheme = (isDark) => ({
    colors: isDark ? colors.dark : colors.light,
    fonts: {
        d: 'Playfair Display',
        m: 'DM Mono',
        s: 'Instrument Sans',
    },
    radii: {
        r: 8,
        lg: 14,
        xl: 20,
        round: 9999,
    }
});

// Legacy export for backward compatibility during transition
export const theme = getTheme(false);

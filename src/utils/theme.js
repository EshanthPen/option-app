export const colors = {
    light: {
        bg: '#F5F3E9', // Cream bg
        surface: '#FFFFFF', // White surface for contrast
        surface2: '#EBE8DC', // Darker cream for secondary
        border: '#232E52', // Thick Navy border
        border2: '#232E52',
        ink: '#232E52', // Navy text
        ink2: '#4A5576', // Muted navy text
        ink3: '#727C9C', // Tertiary text
        ink4: '#A2AAC5', // Quaternary
        // For a strict duotone retro look, we'll map status colors to variations of navy or muted vintage tones.
        // Actually, pure monochrome navy might be hard for grades. Let's use pure Navy for everything.
        red: '#232E52', // Navy
        orange: '#232E52', // Navy
        green: '#232E52', // Navy
        blue: '#232E52', // Navy
        purple: '#232E52', // Navy
        accent: '#232E52', // Navy
    },
    dark: {
        bg: '#0A0A0B', // Deep Ink-Black
        surface: '#121214', // Charcoal surface
        surface2: '#1C1C1E', // Lighter charcoal for cards/secondary
        border: '#F5F3E9', // Cream border
        border2: '#F5F3E9',
        ink: '#F5F3E9', // Cream text
        ink2: '#DADBCC',
        ink3: '#9EA18D', // Slightly more muted for contrast on dark
        ink4: '#646857',
        red: '#F5F3E9',
        orange: '#F5F3E9',
        green: '#F5F3E9',
        blue: '#F5F3E9',
        purple: '#F5F3E9',
        accent: '#F5F3E9',
    }
};

export const getTheme = (isDark) => ({
    colors: isDark ? colors.dark : colors.light,
    fonts: {
        d: 'CormorantGaramond-Bold', // Thick, vintage serif
        m: 'CormorantGaramond-Regular',
        s: 'CormorantGaramond-SemiBold', // Elegant body
        b: 'CormorantGaramond-Bold', // Button font
    },
    radii: {
        r: 10,
        lg: 16,
        xl: 24,
        round: 9999,
    }
});

export const theme = getTheme(false);

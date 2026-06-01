export const THEME_PRESETS = {
    brutalist: {
        name: 'Clean Grayscale',
        description: 'Soft, elegant grayscale UI',
        light: {
            bg: '#FFFFFF',
            surface: '#FFFFFF',
            surface2: '#F5F5F5',
            border: '#E5E5E5',
            border2: '#A1A1A1',
            ink: '#0A0A0A',
            ink2: '#171717',
            ink3: '#737373',
            ink4: '#A1A1AA',
            red: '#E7000B',
            orange: '#F97316',
            green: '#10B981',
            blue: '#2563EF',
            purple: '#7C3AED',
            accent: '#171717',
        },
        dark: {
            bg: '#0A0A0A',
            surface: '#0A0A0A',
            surface2: '#262626',
            border: '#262626',
            border2: '#525252',
            ink: '#FAFAFA',
            ink2: '#FAFAFA',
            ink3: '#A1A1A1',
            ink4: '#52525B',
            red: '#E7000B',
            orange: '#F97316',
            green: '#10B981',
            blue: '#2563EF',
            purple: '#A78BFA',
            accent: '#FAFAFA',
        },
    }
};

// Soft modern shadows
const shadows = {
    none: {
        shadowColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
    },
    sm: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    md: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 3,
    },
};

export const getTheme = (isDark) => {
    const preset = THEME_PRESETS.brutalist;
    return {
        colors: isDark ? preset.dark : preset.light,
        fonts: {
            d: 'Geist-Bold',
            m: 'Geist',
            s: 'Geist-SemiBold',
            b: 'Geist-Bold',
            mono: 'DMMono',
            logo: 'PlayfairDisplay-Bold',
        },
        shadows,
        radii: { r: 0, lg: 10, xl: 16, round: 9999 }, // Soft rounded corners matching 0.625rem
    };
};

export const theme = getTheme(true); // Default to dark mode
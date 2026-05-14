export const THEME_PRESETS = {
    brutalist: {
        name: 'Brutalist',
        description: 'High contrast, pure monochrome',
        light: {
            bg: '#FFFFFF',
            surface: '#FAFAFA',
            surface2: '#F4F4F5',
            border: '#000000', // Hard black borders
            border2: '#27272A',
            ink: '#000000',
            ink2: '#3F3F46',
            ink3: '#71717A',
            ink4: '#A1A1AA',
            red: '#EF4444',
            orange: '#F97316',
            green: '#10B981',
            blue: '#3B82F6',
            purple: '#7C3AED',
            accent: '#000000',
        },
        dark: {
            bg: '#000000',        // True black background
            surface: '#0A0A0A',   
            surface2: '#171717',  
            border: '#262626',    // Sharp borders
            border2: '#404040',
            ink: '#FAFAFA',       
            ink2: '#A1A1AA',      
            ink3: '#71717A',      
            ink4: '#52525B',
            red: '#EF4444',
            orange: '#F97316',
            green: '#10B981',
            blue: '#3B82F6',
            purple: '#A78BFA',
            accent: '#FFFFFF',
        },
    }
};

// Sharp, zero-blur offset shadows 
const shadows = {
    none: {
        shadowColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
    },
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 1, // Solid opacity, no blur
        shadowRadius: 0,
        elevation: 2,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 4, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 4,
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
        radii: { r: 0, lg: 4, xl: 8, round: 9999 }, // Tighter, sharper corners
    };
};

export const theme = getTheme(true); // Default to dark mode
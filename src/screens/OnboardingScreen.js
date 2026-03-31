import React, { useRef, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    ScrollView,
    Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BookOpen, Timer, Trophy, Sparkles, ArrowRight, Check } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');

const ONBOARDING_KEY = 'hasCompletedOnboarding';

const slides = [
    {
        key: 'welcome',
        Icon: Sparkles,
        title: 'Option',
        subtitle: 'Your academic command center',
        description:
            'The all-in-one student platform that brings your grades, focus tools, and competitive drive together in one place.',
    },
    {
        key: 'grades',
        Icon: BookOpen,
        title: 'Track Every Grade',
        subtitle: 'All your grades, unified',
        description:
            'Connect StudentVUE, Google Classroom, and Canvas to see every assignment and score in a single, elegant gradebook.',
    },
    {
        key: 'focus',
        Icon: Timer,
        title: 'Stay Focused',
        subtitle: 'Deep work, made simple',
        description:
            'Use the built-in Pomodoro timer, block distracting websites, and build a focus score that reflects your dedication.',
    },
    {
        key: 'compete',
        Icon: Trophy,
        title: 'Compete & Grow',
        subtitle: 'Rise through the ranks',
        description:
            'Climb leaderboards, unlock achievements, and challenge friends to stay on top of your academic game.',
    },
];

const OnboardingScreen = ({ onComplete }) => {
    const { theme } = useTheme();
    const scrollRef = useRef(null);
    const [activeIndex, setActiveIndex] = useState(0);

    const handleScroll = useCallback((event) => {
        const offsetX = event.nativeEvent.contentOffset.x;
        const index = Math.round(offsetX / width);
        if (index >= 0 && index < slides.length) {
            setActiveIndex(index);
        }
    }, []);

    const goToNext = useCallback(() => {
        const nextIndex = activeIndex + 1;
        if (nextIndex < slides.length) {
            setActiveIndex(nextIndex);
            scrollRef.current?.scrollTo({
                x: nextIndex * width,
                animated: true,
            });
        }
    }, [activeIndex]);

    const handleComplete = useCallback(async () => {
        try {
            await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
        } catch (e) {
            // Fail silently -- the user can still proceed
        }
        onComplete?.();
    }, [onComplete]);

    const isLast = activeIndex === slides.length - 1;

    const s = styles(theme);

    return (
        <View style={s.container}>
            <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleScroll}
                onScroll={Platform.OS === 'web' ? handleScroll : undefined}
                scrollEventThrottle={16}
                bounces={false}
            >
                {slides.map((slide, index) => {
                    const { Icon, title, subtitle, description } = slide;
                    return (
                        <View key={slide.key} style={s.slide}>
                            {/* Icon container */}
                            <View style={s.iconWrapper}>
                                <View style={s.iconBox}>
                                    <Icon
                                        size={48}
                                        color={theme.colors.bg}
                                        strokeWidth={1.8}
                                    />
                                </View>
                                {/* Offset shadow */}
                                <View style={s.iconShadow} />
                            </View>

                            {/* Title */}
                            <Text style={s.title}>{title}</Text>

                            {/* Subtitle */}
                            <Text style={s.subtitle}>{subtitle}</Text>

                            {/* Divider */}
                            <View style={s.divider} />

                            {/* Description */}
                            <Text style={s.description}>{description}</Text>
                        </View>
                    );
                })}
            </ScrollView>

            {/* Bottom controls */}
            <View style={s.footer}>
                {/* Dot pagination */}
                <View style={s.dots}>
                    {slides.map((_, i) => (
                        <View
                            key={i}
                            style={[
                                s.dot,
                                i === activeIndex && s.dotActive,
                            ]}
                        />
                    ))}
                </View>

                {/* Action button */}
                <TouchableOpacity
                    style={s.button}
                    activeOpacity={0.85}
                    onPress={isLast ? handleComplete : goToNext}
                >
                    <View style={s.buttonInner}>
                        <Text style={s.buttonText}>
                            {isLast ? 'Get Started' : 'Next'}
                        </Text>
                        {isLast ? (
                            <Check size={20} color={theme.colors.bg} strokeWidth={2.5} />
                        ) : (
                            <ArrowRight size={20} color={theme.colors.bg} strokeWidth={2.5} />
                        )}
                    </View>
                    {/* Button offset shadow */}
                    <View style={s.buttonShadow} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = (theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.colors.bg,
        },
        slide: {
            width,
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 40,
            paddingBottom: 160,
        },
        // --- Icon ---
        iconWrapper: {
            position: 'relative',
            marginBottom: 36,
        },
        iconBox: {
            width: 100,
            height: 100,
            borderRadius: theme.radii.lg,
            backgroundColor: theme.colors.ink,
            borderWidth: 3,
            borderColor: theme.colors.border,
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 2,
        },
        iconShadow: {
            position: 'absolute',
            top: 6,
            left: 6,
            width: 100,
            height: 100,
            borderRadius: theme.radii.lg,
            backgroundColor: theme.colors.border,
            zIndex: 1,
        },
        // --- Text ---
        title: {
            fontFamily: theme.fonts.d,
            fontSize: 42,
            color: theme.colors.ink,
            textAlign: 'center',
            marginBottom: 8,
            letterSpacing: -0.5,
        },
        subtitle: {
            fontFamily: theme.fonts.s,
            fontSize: 20,
            color: theme.colors.ink2,
            textAlign: 'center',
            marginBottom: 20,
        },
        divider: {
            width: 40,
            height: 3,
            backgroundColor: theme.colors.border,
            borderRadius: 2,
            marginBottom: 20,
        },
        description: {
            fontFamily: theme.fonts.m,
            fontSize: 18,
            color: theme.colors.ink3,
            textAlign: 'center',
            lineHeight: 26,
            maxWidth: 300,
        },
        // --- Footer ---
        footer: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingBottom: Platform.OS === 'ios' ? 50 : 36,
            paddingHorizontal: 40,
            alignItems: 'center',
            gap: 28,
            backgroundColor: theme.colors.bg,
        },
        dots: {
            flexDirection: 'row',
            gap: 10,
        },
        dot: {
            width: 10,
            height: 10,
            borderRadius: 5,
            borderWidth: 2,
            borderColor: theme.colors.border,
            backgroundColor: 'transparent',
        },
        dotActive: {
            backgroundColor: theme.colors.ink,
        },
        // --- Button ---
        button: {
            position: 'relative',
            alignSelf: 'stretch',
        },
        buttonInner: {
            height: 58,
            borderRadius: theme.radii.r,
            backgroundColor: theme.colors.ink,
            borderWidth: 3,
            borderColor: theme.colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            zIndex: 2,
        },
        buttonShadow: {
            position: 'absolute',
            top: 5,
            left: 5,
            right: -5,
            bottom: -5,
            borderRadius: theme.radii.r,
            backgroundColor: theme.colors.border,
            zIndex: 1,
        },
        buttonText: {
            fontFamily: theme.fonts.b,
            fontSize: 20,
            color: theme.colors.bg,
            letterSpacing: 0.5,
        },
    });

export default OnboardingScreen;

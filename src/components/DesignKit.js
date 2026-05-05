/**
 * DesignKit — shared primitives matching the Claude Design handoff
 * (ui_kits/app/index.html). Use across all screens for visual consistency.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Platform } from 'react-native';
import { Search, Bell } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import SearchModal from './SearchModal';

// ── Semantic colors (universal across themes) ────────────────────
export const SEM = {
    red:    '#E03E3E',
    orange: '#D97706',
    green:  '#16A34A',
    blue:   '#2563EB',
    purple: '#7C3AED',
    gold:   '#FFB800',
};

// ── Grade utilities ──────────────────────────────────────────────
export const gradeColor = (pct) => {
    if (pct >= 90) return SEM.green;
    if (pct >= 80) return SEM.blue;
    if (pct >= 70) return SEM.orange;
    return SEM.red;
};

export const gradeLetter = (pct) => {
    if (pct >= 93) return 'A';
    if (pct >= 90) return 'A-';
    if (pct >= 87) return 'B+';
    if (pct >= 83) return 'B';
    if (pct >= 80) return 'B-';
    if (pct >= 77) return 'C+';
    if (pct >= 73) return 'C';
    if (pct >= 70) return 'C-';
    return 'D';
};

// ── Card ─────────────────────────────────────────────────────────
export function Card({ children, style, onPress, padding = 16, noBorder, gradient }) {
    const { theme } = useTheme();
    const cardStyle = {
        backgroundColor: theme.colors.surface,
        borderRadius: 6,
        padding,
        borderWidth: noBorder ? 0 : 1,
        borderColor: theme.colors.border,
        ...style,
    };
    if (onPress) {
        return (
            <TouchableOpacity onPress={onPress} style={cardStyle} activeOpacity={0.85}>
                {children}
            </TouchableOpacity>
        );
    }
    return <View style={cardStyle}>{children}</View>;
}

// ── Button ───────────────────────────────────────────────────────
export function Button({
    children,
    variant = 'primary',
    size = 'md',
    icon: Icon,
    onPress,
    disabled,
    loading,
    style,
}) {
    const { theme } = useTheme();

    const sizes = {
        sm: { paddingV: 6,  paddingH: 12, fontSize: 12, height: 30, iconSize: 13 },
        md: { paddingV: 9,  paddingH: 16, fontSize: 13, height: 38, iconSize: 14 },
        lg: { paddingV: 12, paddingH: 20, fontSize: 14, height: 46, iconSize: 16 },
    }[size];

    const variants = {
        primary:   { bg: theme.colors.ink,    fg: theme.colors.bg, border: theme.colors.ink },
        secondary: { bg: theme.colors.surface, fg: theme.colors.ink, border: theme.colors.border2 },
        ghost:     { bg: 'transparent',       fg: theme.colors.ink2, border: 'transparent' },
        danger:    { bg: SEM.red,             fg: '#fff',           border: SEM.red },
        accent:    { bg: theme.colors.accent, fg: '#fff',           border: theme.colors.accent },
        gold:      { bg: SEM.gold,            fg: '#1A1A2E',        border: SEM.gold },
    }[variant];

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={0.8}
            style={[{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 6,
                backgroundColor: variants.bg,
                borderColor: variants.border,
                borderWidth: 1,
                borderRadius: 10,
                paddingVertical: sizes.paddingV,
                paddingHorizontal: sizes.paddingH,
                height: sizes.height,
                opacity: (disabled || loading) ? 0.5 : 1,
            }, style]}
        >
            {loading
                ? <ActivityIndicator size="small" color={variants.fg} />
                : Icon && <Icon size={sizes.iconSize} color={variants.fg} strokeWidth={2.25} />
            }
            <Text style={{
                fontFamily: theme.fonts.s,
                fontSize: sizes.fontSize,
                fontWeight: '600',
                color: variants.fg,
            }}>
                {children}
            </Text>
        </TouchableOpacity>
    );
}

// ── Badge ────────────────────────────────────────────────────────
export function Badge({ children, color, style }) {
    const { theme } = useTheme();
    const c = color || theme.colors.ink2;
    return (
        <View style={[{
            paddingHorizontal: 8, paddingVertical: 3,
            borderRadius: 6,
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: c,
        }, style]}>
            <Text style={{
                fontFamily: theme.fonts.s,
                fontSize: 11, fontWeight: '600',
                color: c,
            }}>
                {children}
            </Text>
        </View>
    );
}

// ── TopBar (matches design exactly) ───────────────────────────────
/**
 * <TopBar title="Calendar" subtitle="April 2026 · Week of the 19th"
 *         actions={<Button variant="primary" icon={Plus}>Add event</Button>} />
 *
 * By default shows search input + notification bell on the right.
 * Pass `showSearch={false}` or `showBell={false}` to hide.
 */
export function TopBar({
    title, subtitle, actions, style,
    showSearch = true, showBell = true,
}) {
    const { theme } = useTheme();
    const isWeb = Platform.OS === 'web';
    const [searchOpen, setSearchOpen] = useState(false);

    // ⌘K / Ctrl+K shortcut on web — open search globally
    useEffect(() => {
        if (!isWeb || !showSearch || typeof window === 'undefined') return;
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                setSearchOpen(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isWeb, showSearch]);

    return (
        <>
            <View style={[{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 32, paddingTop: 20, paddingBottom: 20,
                backgroundColor: theme.colors.bg,
                gap: 12,
            }, style]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{
                        fontFamily: theme.fonts.b,
                        fontSize: 22, fontWeight: '700',
                        color: theme.colors.ink,
                        letterSpacing: -0.4,
                    }} numberOfLines={1}>
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text style={{
                            fontFamily: theme.fonts.m,
                            fontSize: 12, color: theme.colors.ink3,
                            marginTop: 2,
                        }} numberOfLines={1}>
                            {subtitle}
                        </Text>
                    ) : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {showSearch && isWeb && (
                        <TouchableOpacity
                            onPress={() => setSearchOpen(true)}
                            activeOpacity={0.85}
                            style={{
                                flexDirection: 'row', alignItems: 'center', gap: 8,
                                paddingHorizontal: 12, paddingVertical: 8,
                                backgroundColor: theme.colors.bg,
                                borderWidth: 1, borderColor: theme.colors.border,
                                borderRadius: 10, width: 260,
                            }}
                        >
                            <Search size={14} color={theme.colors.ink3} />
                            <Text style={{
                                flex: 1, paddingVertical: 0,
                                fontFamily: theme.fonts.m, fontSize: 13,
                                color: theme.colors.ink3,
                            }} numberOfLines={1}>
                                Search classes, assignments…
                            </Text>
                            <View style={{
                                paddingHorizontal: 5, paddingVertical: 1,
                                backgroundColor: theme.colors.surface2,
                                borderRadius: 4,
                            }}>
                                <Text style={{ fontFamily: theme.fonts.mono, fontSize: 10, color: theme.colors.ink4 }}>
                                    ⌘K
                                </Text>
                            </View>
                        </TouchableOpacity>
                    )}
                    {showBell && (
                        <TouchableOpacity style={{
                            width: 36, height: 36, borderRadius: 10,
                            backgroundColor: theme.colors.surface,
                            borderWidth: 1, borderColor: theme.colors.border,
                            alignItems: 'center', justifyContent: 'center', position: 'relative',
                        }}>
                            <Bell size={16} color={theme.colors.ink2} />
                            <View style={{
                                position: 'absolute', top: 8, right: 8,
                                width: 7, height: 7, borderRadius: 4,
                                backgroundColor: SEM.red,
                                borderWidth: 1.5, borderColor: theme.colors.surface,
                            }} />
                        </TouchableOpacity>
                    )}
                    {actions}
                </View>
            </View>
            <SearchModal visible={searchOpen} onClose={() => setSearchOpen(false)} />
        </>
    );
}

// ── GradientCard — wrapper for design's linear-gradient cards ────
export function GradientCard({ colors, style, children, angle = 135 }) {
    // Convert CSS angle (135deg = top-left → bottom-right) to RN start/end
    const rad = ((angle - 90) * Math.PI) / 180;
    const start = { x: 0.5 - Math.cos(rad) * 0.5, y: 0.5 - Math.sin(rad) * 0.5 };
    const end   = { x: 0.5 + Math.cos(rad) * 0.5, y: 0.5 + Math.sin(rad) * 0.5 };
    return (
        <LinearGradient
            colors={colors}
            start={start}
            end={end}
            style={style}
        >
            {children}
        </LinearGradient>
    );
}

// ── Section Header (icon + title + optional action) ──────────────
export function SectionHeader({ icon: Icon, iconColor, title, badge, action, onActionPress, style }) {
    const { theme } = useTheme();
    return (
        <View style={[{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 14,
        }, style]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {Icon && <Icon size={18} color={iconColor || theme.colors.ink} strokeWidth={2.4} />}
                <Text style={{
                    fontFamily: theme.fonts.s,
                    fontSize: 16, fontWeight: '600',
                    color: theme.colors.ink,
                }}>
                    {title}
                </Text>
                {badge}
            </View>
            {action ? (
                <TouchableOpacity onPress={onActionPress}>
                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3 }}>
                        {action} →
                    </Text>
                </TouchableOpacity>
            ) : null}
        </View>
    );
}

// ── Switch (toggle) ──────────────────────────────────────────────
export function Switch({ on, onToggle, size = 'md' }) {
    const { theme } = useTheme();
    const dims = size === 'sm'
        ? { w: 32, h: 20, knob: 14, knobLeft: on ? 16 : 3 }
        : { w: 40, h: 24, knob: 18, knobLeft: on ? 19 : 3 };
    return (
        <TouchableOpacity
            onPress={onToggle}
            activeOpacity={0.85}
            style={{
                width: dims.w, height: dims.h,
                borderRadius: dims.h / 2,
                backgroundColor: on ? SEM.green : theme.colors.border2,
                position: 'relative',
            }}
        >
            <View style={{
                width: dims.knob, height: dims.knob, borderRadius: dims.knob / 2,
                backgroundColor: '#fff',
                position: 'absolute',
                top: (dims.h - dims.knob) / 2,
                left: dims.knobLeft,
            }} />
        </TouchableOpacity>
    );
}

// ── Tab Pills (segmented control) ────────────────────────────────
export function TabPills({ tabs, value, onChange, style }) {
    const { theme } = useTheme();
    return (
        <View style={[{
            flexDirection: 'row',
            backgroundColor: theme.colors.surface2,
            padding: 3,
            borderRadius: 8,
            gap: 4,
        }, style]}>
            {tabs.map((tab) => {
                const id = typeof tab === 'string' ? tab : tab.id;
                const label = typeof tab === 'string' ? tab : tab.label;
                const active = value === id;
                return (
                    <TouchableOpacity
                        key={id}
                        onPress={() => onChange(id)}
                        activeOpacity={0.8}
                        style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 6,
                            backgroundColor: active ? theme.colors.surface : 'transparent',
                        }}
                    >
                        <Text style={{
                            fontFamily: theme.fonts.s,
                            fontSize: 12,
                            fontWeight: active ? '600' : '500',
                            color: active ? theme.colors.ink : theme.colors.ink3,
                        }}>
                            {label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

// ── Empty State ──────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, message, action }) {
    const { theme } = useTheme();
    return (
        <Card padding={32} style={{ alignItems: 'center', justifyContent: 'center' }}>
            {Icon && (
                <View style={{
                    width: 56, height: 56, borderRadius: 28,
                    backgroundColor: theme.colors.surface2,
                    alignItems: 'center', justifyContent: 'center',
                    marginBottom: 14,
                }}>
                    <Icon size={26} color={theme.colors.ink3} strokeWidth={1.8} />
                </View>
            )}
            {title && (
                <Text style={{
                    fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '600',
                    color: theme.colors.ink, marginBottom: 6, textAlign: 'center',
                }}>
                    {title}
                </Text>
            )}
            {message && (
                <Text style={{
                    fontFamily: theme.fonts.m, fontSize: 13,
                    color: theme.colors.ink3, textAlign: 'center', maxWidth: 320, lineHeight: 18,
                }}>
                    {message}
                </Text>
            )}
            {action && <View style={{ marginTop: 14 }}>{action}</View>}
        </Card>
    );
}

// ── ListRow (table-like row) ─────────────────────────────────────
export function ListRow({ left, label, sub, right, onPress, isLast, leftBar }) {
    const { theme } = useTheme();
    const Inner = onPress ? TouchableOpacity : View;
    return (
        <Inner
            {...(onPress ? { onPress, activeOpacity: 0.7 } : {})}
            style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingVertical: 14, paddingHorizontal: 16,
                borderBottomWidth: isLast ? 0 : 1,
                borderBottomColor: theme.colors.border,
            }}
        >
            {leftBar && <View style={{ width: 3, height: 32, backgroundColor: leftBar, borderRadius: 2, flexShrink: 0 }} />}
            {left}
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink }} numberOfLines={1}>
                    {label}
                </Text>
                {sub ? (
                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 2 }} numberOfLines={1}>
                        {sub}
                    </Text>
                ) : null}
            </View>
            {right}
        </Inner>
    );
}

// ── Section Label (uppercase small caps) ─────────────────────────
export function SectionLabel({ children, style }) {
    const { theme } = useTheme();
    return (
        <Text style={[{
            fontFamily: theme.fonts.m,
            fontSize: 10,
            fontWeight: '600',
            color: theme.colors.ink3,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            marginBottom: 8,
        }, style]}>
            {children}
        </Text>
    );
}

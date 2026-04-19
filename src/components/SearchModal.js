/**
 * SearchModal — global search palette opened from the TopBar search input
 * (or via ⌘K on web).
 *
 * Searches:
 *   - Classes (from AsyncStorage 'studentVueGrades')
 *   - Assignments (across all classes)
 *   - Tasks (from Supabase 'tasks' table)
 *   - Pages (Dashboard / Calendar / etc.)
 *
 * Click result → navigates to the appropriate screen.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, Modal, FlatList, Platform, ActivityIndicator,
} from 'react-native';
import {
    Search, X, BookOpen, ClipboardList, FileText, CalendarDays,
    LayoutDashboard, Sparkles, Timer, Trophy, Settings as SettingsIcon,
    Plug, Crown,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';

const PAGES = [
    { key: 'page:home',        label: 'Dashboard',     route: 'Home',         icon: LayoutDashboard },
    { key: 'page:ai',          label: 'AI Tutor',      route: 'AI',           icon: Sparkles },
    { key: 'page:calendar',    label: 'Calendar',      route: 'Calendar',     icon: CalendarDays },
    { key: 'page:gradebook',   label: 'Gradebook',     route: 'Gradebook',    icon: BookOpen },
    { key: 'page:focus',       label: 'Focus',         route: 'Focus',        icon: Timer },
    { key: 'page:leaderboard', label: 'Leaderboard',   route: 'Leaderboard',  icon: Trophy },
    { key: 'page:integrations',label: 'Integrations',  route: 'Integrations', icon: Plug },
    { key: 'page:premium',     label: 'Upgrade to Pro',route: 'Premium',      icon: Crown },
    { key: 'page:settings',    label: 'Settings',      route: 'Settings',     icon: SettingsIcon },
];

export default function SearchModal({ visible, onClose }) {
    const { theme } = useTheme();
    const navigation = useNavigation();
    const inputRef = useRef(null);
    const [query, setQuery] = useState('');
    const [classes, setClasses] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);

    // Load data when opened
    useEffect(() => {
        if (!visible) return;
        setQuery('');
        setActiveIndex(0);
        // Focus input
        setTimeout(() => inputRef.current?.focus?.(), 50);

        (async () => {
            setLoading(true);
            try {
                const raw = await AsyncStorage.getItem('studentVueGrades');
                if (raw) setClasses(JSON.parse(raw) || []);

                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user?.id) {
                    const { data } = await supabase
                        .from('tasks')
                        .select('id, title, due_date')
                        .eq('user_id', session.user.id)
                        .limit(200);
                    if (data) setTasks(data);
                }
            } catch (e) { console.warn('search load:', e); }
            finally { setLoading(false); }
        })();
    }, [visible]);

    // Build searchable index
    const allItems = useMemo(() => {
        const items = [];
        // Classes
        for (const c of classes) {
            items.push({
                key: 'class:' + (c.id || c.name),
                type: 'class',
                title: c.name,
                sub: [c.type, c.teacher].filter(Boolean).join(' · '),
                icon: BookOpen,
                route: 'Gradebook',
            });
            // Each assignment as its own result
            for (const a of (c.assignments || [])) {
                items.push({
                    key: 'asgn:' + (c.id || c.name) + ':' + (a.id || a.name || a.title),
                    type: 'assignment',
                    title: a.name || a.title,
                    sub: `${c.name}${a.date ? ' · ' + a.date : ''}${a.category ? ' · ' + a.category : ''}`,
                    icon: ClipboardList,
                    route: 'Gradebook',
                });
            }
        }
        // Tasks
        for (const t of tasks) {
            items.push({
                key: 'task:' + t.id,
                type: 'task',
                title: t.title,
                sub: t.due_date ? `Due ${t.due_date}` : 'Task',
                icon: FileText,
                route: 'Calendar',
            });
        }
        // Pages always available
        for (const p of PAGES) {
            items.push({
                key: p.key,
                type: 'page',
                title: p.label,
                sub: 'Page',
                icon: p.icon,
                route: p.route,
            });
        }
        return items;
    }, [classes, tasks]);

    // Filter by query
    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) {
            // No query: show pages first + recent items
            return [
                ...PAGES.slice(0, 6).map(p => ({
                    key: p.key, type: 'page', title: p.label, sub: 'Jump to page',
                    icon: p.icon, route: p.route,
                })),
            ];
        }
        const scored = [];
        for (const item of allItems) {
            const t = (item.title || '').toLowerCase();
            const s = (item.sub || '').toLowerCase();
            let score = 0;
            if (t === q) score = 100;
            else if (t.startsWith(q)) score = 80;
            else if (t.includes(q)) score = 60;
            else if (s.includes(q)) score = 30;
            if (score > 0) scored.push({ ...item, _score: score });
        }
        return scored
            .sort((a, b) => b._score - a._score)
            .slice(0, 25);
    }, [query, allItems]);

    useEffect(() => {
        // Reset active index when results change
        setActiveIndex(0);
    }, [query]);

    const select = (item) => {
        if (item.route) navigation.navigate(item.route);
        onClose?.();
    };

    const onKeyPress = (e) => {
        if (e.nativeEvent.key === 'ArrowDown') {
            e.preventDefault?.();
            setActiveIndex(i => Math.min(i + 1, results.length - 1));
        } else if (e.nativeEvent.key === 'ArrowUp') {
            e.preventDefault?.();
            setActiveIndex(i => Math.max(i - 1, 0));
        } else if (e.nativeEvent.key === 'Enter') {
            e.preventDefault?.();
            const item = results[activeIndex];
            if (item) select(item);
        } else if (e.nativeEvent.key === 'Escape') {
            onClose?.();
        }
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity
                activeOpacity={1}
                onPress={onClose}
                style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    alignItems: 'center',
                    paddingTop: Platform.OS === 'web' ? 80 : 60,
                }}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={(e) => e.stopPropagation?.()}
                    style={{
                        width: '90%', maxWidth: 560,
                        backgroundColor: theme.colors.surface,
                        borderRadius: 14,
                        borderWidth: 1, borderColor: theme.colors.border,
                        ...theme.shadows.lg,
                        overflow: 'hidden',
                    }}
                >
                    {/* Search input */}
                    <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        padding: 14,
                        borderBottomWidth: 1, borderBottomColor: theme.colors.border,
                    }}>
                        <Search size={16} color={theme.colors.ink3} />
                        <TextInput
                            ref={inputRef}
                            value={query}
                            onChangeText={setQuery}
                            onKeyPress={Platform.OS === 'web' ? onKeyPress : undefined}
                            onSubmitEditing={() => results[activeIndex] && select(results[activeIndex])}
                            placeholder="Search classes, assignments, tasks, pages…"
                            placeholderTextColor={theme.colors.ink3}
                            autoFocus
                            style={{
                                flex: 1,
                                fontFamily: theme.fonts.s, fontSize: 15,
                                color: theme.colors.ink, paddingVertical: 4,
                                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                            }}
                        />
                        <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                            <Text style={{
                                fontFamily: theme.fonts.mono, fontSize: 10,
                                color: theme.colors.ink3,
                                paddingHorizontal: 5, paddingVertical: 1,
                                backgroundColor: theme.colors.surface2, borderRadius: 4,
                            }}>
                                Esc
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Results */}
                    <View style={{ maxHeight: 400 }}>
                        {loading ? (
                            <View style={{ padding: 30, alignItems: 'center' }}>
                                <ActivityIndicator color={theme.colors.ink3} size="small" />
                            </View>
                        ) : results.length === 0 ? (
                            <View style={{ padding: 30, alignItems: 'center' }}>
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3 }}>
                                    No matches for "{query}"
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                data={results}
                                keyExtractor={(item) => item.key}
                                keyboardShouldPersistTaps="handled"
                                renderItem={({ item, index }) => {
                                    const Icon = item.icon || FileText;
                                    const active = index === activeIndex;
                                    return (
                                        <TouchableOpacity
                                            onPress={() => select(item)}
                                            onMouseEnter={Platform.OS === 'web' ? () => setActiveIndex(index) : undefined}
                                            activeOpacity={0.7}
                                            style={{
                                                flexDirection: 'row', alignItems: 'center', gap: 12,
                                                padding: 12, paddingHorizontal: 14,
                                                backgroundColor: active ? theme.colors.surface2 : 'transparent',
                                            }}
                                        >
                                            <View style={{
                                                width: 32, height: 32, borderRadius: 7,
                                                backgroundColor: theme.colors.surface2,
                                                alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <Icon size={15} color={theme.colors.ink2} />
                                            </View>
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <Text style={{
                                                    fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600',
                                                    color: theme.colors.ink,
                                                }} numberOfLines={1}>
                                                    {item.title}
                                                </Text>
                                                <Text style={{
                                                    fontFamily: theme.fonts.m, fontSize: 11,
                                                    color: theme.colors.ink3, marginTop: 1,
                                                }} numberOfLines={1}>
                                                    {item.sub}
                                                </Text>
                                            </View>
                                            <View style={{
                                                paddingHorizontal: 6, paddingVertical: 2,
                                                backgroundColor: theme.colors.surface2,
                                                borderRadius: 4,
                                            }}>
                                                <Text style={{
                                                    fontFamily: theme.fonts.mono, fontSize: 9,
                                                    color: theme.colors.ink3,
                                                    textTransform: 'uppercase',
                                                }}>
                                                    {item.type}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                }}
                            />
                        )}
                    </View>

                    {/* Footer hint */}
                    <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        padding: 10, paddingHorizontal: 14,
                        borderTopWidth: 1, borderTopColor: theme.colors.border,
                        backgroundColor: theme.colors.surface2 + '60',
                    }}>
                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3 }}>
                            <Text style={{ fontFamily: theme.fonts.mono }}>↑↓</Text> navigate
                        </Text>
                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3 }}>
                            <Text style={{ fontFamily: theme.fonts.mono }}>↵</Text> open
                        </Text>
                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3 }}>
                            <Text style={{ fontFamily: theme.fonts.mono }}>esc</Text> close
                        </Text>
                        <View style={{ flex: 1 }} />
                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink4 }}>
                            {results.length} result{results.length === 1 ? '' : 's'}
                        </Text>
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

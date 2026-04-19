import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, Animated, TextInput, KeyboardAvoidingView,
    Platform,
} from 'react-native';
import {
    Sparkles, Brain, AlertTriangle, TrendingUp, Clock, ChevronRight,
    CheckCircle, Target, Flame, BarChart3, Calendar, Zap, ArrowRight,
    AlertCircle, Crown, Send, MessageCircle, BookOpen, RefreshCw,
    Lock, Plus, Mic, Paperclip, GraduationCap, HelpCircle, ArrowUp,
    CalendarPlus, Trash2,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { usePremium } from '../context/PremiumContext';
import { useNavigation } from '@react-navigation/native';
import {
    generateAIDailyBriefing,
    generateAIWeeklyReport,
    generateAIStudyPlan,
    generateAIReschedule,
    chatWithAI,
} from '../utils/aiEngine';
import { createGoogleCalendarEvent } from '../utils/googleCalendarAPI';
import { TopBar, Card, Button, Badge, EmptyState, SEM, SectionLabel } from '../components/DesignKit';

const CHAT_HISTORY_KEY = '@ai_chat_history';
// Each saved item: { id, title, messages: [], updatedAt }

const MODES = [
    { id: 'chat',     label: 'Tutor',   icon: GraduationCap },
    { id: 'briefing', label: 'Briefing',icon: Sparkles },
    { id: 'plan',     label: 'Planner', icon: Calendar },
    { id: 'report',   label: 'Report',  icon: BarChart3 },
];

const SUGGESTIONS = [
    'Plan my week',
    'Help me boost a low grade',
    'Quiz me on my next test',
    'Explain a concept',
    'Write an essay outline',
];

export default function AIAssistantScreen() {
    const { theme } = useTheme();
    const { isPro } = usePremium();
    const navigation = useNavigation();

    const [mode, setMode] = useState('chat');
    const [briefing, setBriefing] = useState(null);
    const [weeklyReport, setWeeklyReport] = useState(null);
    const [studyPlan, setStudyPlan] = useState(null);
    const [reschedule, setReschedule] = useState(null);
    const [tabLoading, setTabLoading] = useState(false);

    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);

    // Persisted chat history: list of past conversations
    const [chatHistory, setChatHistory] = useState([]);
    const [activeChatId, setActiveChatId] = useState(null);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const bottomRef = useRef(null);
    const scrollRef = useRef(null);

    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
        // Load saved chat history
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
                if (raw) setChatHistory(JSON.parse(raw));
            } catch {}
        })();
    }, []);

    // Persist chat history whenever it changes
    useEffect(() => {
        AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory)).catch(() => {});
    }, [chatHistory]);

    // Save current chat into history every time messages settle
    const persistCurrentChat = (msgs) => {
        if (msgs.length === 0) return;
        const firstUserMsg = msgs.find(m => m.role === 'user');
        const title = firstUserMsg ? firstUserMsg.content.slice(0, 60) : 'New conversation';
        setChatHistory(prev => {
            const id = activeChatId || Date.now().toString(36);
            if (!activeChatId) setActiveChatId(id);
            const next = prev.filter(c => c.id !== id);
            return [{ id, title, messages: msgs, updatedAt: Date.now() }, ...next].slice(0, 30);
        });
    };

    const startNewChat = () => {
        setActiveChatId(null);
        setChatMessages([]);
        setMode('chat');
    };

    const loadChat = (item) => {
        setActiveChatId(item.id);
        setChatMessages(item.messages || []);
        setMode('chat');
    };

    const deleteChat = (id) => {
        setChatHistory(prev => prev.filter(c => c.id !== id));
        if (activeChatId === id) startNewChat();
    };

    // ── Add suggested study plan block to Google Calendar ──
    const addBlockToCalendar = async (block) => {
        try {
            const token = await AsyncStorage.getItem('googleAccessToken');
            if (!token) {
                if (Platform.OS === 'web') window.alert('Connect Google Calendar in Integrations first.');
                else alert('Connect Google Calendar in Integrations first.');
                return;
            }
            // Parse the block's start time (e.g. "3:00 PM") into today's date
            const today = new Date();
            const timeStr = block.startTime || block.time || '';
            const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
            if (!m) {
                if (Platform.OS === 'web') window.alert('Could not parse start time.');
                return;
            }
            let hour = parseInt(m[1]);
            const min = parseInt(m[2]);
            const ampm = (m[3] || '').toUpperCase();
            if (ampm === 'PM' && hour < 12) hour += 12;
            if (ampm === 'AM' && hour === 12) hour = 0;
            const start = new Date(today);
            start.setHours(hour, min, 0, 0);
            // Duration parsing
            const durStr = String(block.duration || '45 min');
            const durMatch = durStr.match(/(\d+)/);
            const durMin = durMatch ? parseInt(durMatch[1]) : 45;
            const end = new Date(start.getTime() + durMin * 60000);

            const event = {
                summary: `Option AI: ${block.task}`,
                description: `${block.tip || ''}\n\nScheduled by Option AI Tutor.`,
                start: { dateTime: start.toISOString(), timeZone: 'America/New_York' },
                end:   { dateTime: end.toISOString(),   timeZone: 'America/New_York' },
            };
            const ok = await createGoogleCalendarEvent(token, event);
            if (Platform.OS === 'web') {
                window.alert(ok ? `Added "${block.task}" to your Google Calendar` : 'Failed to add — your Google session may have expired.');
            } else {
                alert(ok ? 'Added to Google Calendar' : 'Failed to add');
            }
        } catch (err) {
            console.error('Add to calendar error:', err);
            if (Platform.OS === 'web') window.alert('Error: ' + err.message);
        }
    };

    useEffect(() => {
        // Auto-scroll chat to bottom on new messages
        if (mode === 'chat' && bottomRef.current) {
            setTimeout(() => bottomRef.current?.scrollToEnd?.({ animated: true }), 80);
        }
    }, [chatMessages, chatLoading, mode]);

    // ── Paywall ────────────────────────────────────────────────
    if (!isPro) {
        return (
            <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
                <TopBar title="AI Tutor" subtitle="Personalized academic coach" />
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                    <Animated.View style={{
                        opacity: fadeAnim, alignItems: 'center', maxWidth: 480,
                    }}>
                        <View style={{
                            width: 64, height: 64, borderRadius: 16,
                            backgroundColor: SEM.gold + '18',
                            alignItems: 'center', justifyContent: 'center',
                            marginBottom: 16,
                        }}>
                            <Sparkles size={30} color={SEM.gold} />
                        </View>
                        <Text style={{ fontFamily: theme.fonts.d, fontSize: 28, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.5, marginBottom: 8, textAlign: 'center' }}>
                            AI Tutor
                        </Text>
                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink3, textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
                            Your personal AI-powered academic coach. Daily briefings, study plans, weekly reports, and chat with AI about your academics.
                        </Text>

                        <Card padding={20} style={{ width: '100%', marginBottom: 16 }}>
                            {[
                                { icon: Brain,         text: 'AI-generated daily briefings & priorities' },
                                { icon: Calendar,      text: 'Smart study plans tailored to your schedule' },
                                { icon: BarChart3,     text: 'Detailed weekly performance reports' },
                                { icon: MessageCircle, text: 'Chat with AI about your academics' },
                                { icon: RefreshCw,     text: 'Auto-reschedule when plans change' },
                                { icon: TrendingUp,    text: 'Grade impact predictions' },
                            ].map((f, i, arr) => {
                                const Icon = f.icon;
                                return (
                                    <View key={i} style={{
                                        flexDirection: 'row', alignItems: 'center', gap: 12,
                                        paddingVertical: 10,
                                        borderTopWidth: i > 0 ? 1 : 0,
                                        borderTopColor: theme.colors.border,
                                    }}>
                                        <Icon size={18} color={theme.colors.accent} />
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink, flex: 1 }}>
                                            {f.text}
                                        </Text>
                                    </View>
                                );
                            })}
                        </Card>

                        <Button variant="gold" size="lg" icon={Crown} onPress={() => navigation.navigate('Premium')}>
                            Upgrade to Pro
                        </Button>
                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 8 }}>
                            7-day free trial · cancel anytime
                        </Text>
                    </Animated.View>
                </View>
            </View>
        );
    }

    // ── Loaders ──────────────────────────────────────────────
    const loadMode = async (m) => {
        setMode(m);
        if (m === 'briefing' && !briefing) {
            setTabLoading(true);
            try { const data = await generateAIDailyBriefing(); setBriefing(data); }
            catch (e) { console.error(e); }
            finally { setTabLoading(false); }
        }
        if (m === 'plan' && !studyPlan) {
            setTabLoading(true);
            try { const data = await generateAIStudyPlan(); setStudyPlan(data); }
            catch (e) { console.error(e); }
            finally { setTabLoading(false); }
        }
        if (m === 'report' && !weeklyReport) {
            setTabLoading(true);
            try { const data = await generateAIWeeklyReport(); setWeeklyReport(data); }
            catch (e) { console.error(e); }
            finally { setTabLoading(false); }
        }
    };

    const handleSendChat = async (txt) => {
        const msg = (txt || chatInput).trim();
        if (!msg) return;
        setChatInput('');
        const withUser = [...chatMessages, { role: 'user', content: msg }];
        setChatMessages(withUser);
        setChatLoading(true);
        try {
            const response = await chatWithAI(msg);
            const withAi = [...withUser, {
                role: 'ai',
                content: response.response,
                suggestions: response.suggestions,
                tip: response.relatedTip,
            }];
            setChatMessages(withAi);
            persistCurrentChat(withAi);
        } catch {
            const withErr = [...withUser, {
                role: 'ai', content: "Sorry, I couldn't process that. Please try again.",
            }];
            setChatMessages(withErr);
            persistCurrentChat(withErr);
        } finally {
            setChatLoading(false);
        }
    };

    const refreshCurrentMode = () => {
        if (mode === 'briefing') { setBriefing(null); loadMode('briefing'); }
        if (mode === 'plan')     { setStudyPlan(null); loadMode('plan'); }
        if (mode === 'report')   { setWeeklyReport(null); loadMode('report'); }
        if (mode === 'chat')     { setChatMessages([]); }
    };

    // ── Avatar for chat bubbles ──────────────────────────────
    const Avatar = ({ role }) => (
        <View style={{
            width: 32, height: 32, borderRadius: 8,
            backgroundColor: role === 'user' ? theme.colors.surface2 : theme.colors.ink,
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
            {role === 'user'
                ? <Text style={{ fontFamily: theme.fonts.s, fontSize: 11, fontWeight: '700', color: theme.colors.ink }}>You</Text>
                : <Sparkles size={15} color="#fff" />
            }
        </View>
    );

    const Bubble = ({ role, children }) => (
        <View style={{
            flexDirection: 'row', gap: 12, marginBottom: 16,
            flexDirection: role === 'user' ? 'row-reverse' : 'row',
        }}>
            <Avatar role={role} />
            <View style={{
                maxWidth: '75%',
                padding: 14, paddingHorizontal: 16,
                borderRadius: role === 'user' ? 14 : 14,
                borderTopRightRadius: role === 'user' ? 4 : 14,
                borderTopLeftRadius:  role === 'user' ? 14 : 4,
                backgroundColor: role === 'user' ? theme.colors.ink : theme.colors.surface,
                borderWidth: role === 'user' ? 0 : 1,
                borderColor: theme.colors.border,
                ...theme.shadows.sm,
            }}>
                {children}
            </View>
        </View>
    );

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.bg, flexDirection: 'row' }}>

            {/* ── Left sidebar: real chat history (web/desktop only) ── */}
            {Platform.OS === 'web' && (
                <View style={{
                    width: 240, flexShrink: 0,
                    backgroundColor: theme.colors.surface,
                    borderRightWidth: 1, borderRightColor: theme.colors.border,
                    display: 'flex', flexDirection: 'column',
                }}>
                    <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                        <Button variant="primary" icon={Plus} onPress={startNewChat}>
                            New conversation
                        </Button>
                    </View>
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8 }}>
                        <SectionLabel style={{ paddingHorizontal: 10, marginBottom: 4 }}>Recent</SectionLabel>
                        {chatHistory.length === 0 ? (
                            <Text style={{
                                fontFamily: theme.fonts.m, fontSize: 11,
                                color: theme.colors.ink3, padding: 10, fontStyle: 'italic',
                            }}>
                                Past chats will appear here.
                            </Text>
                        ) : chatHistory.map((c) => {
                            const active = c.id === activeChatId;
                            const ago = (() => {
                                const sec = Math.floor((Date.now() - c.updatedAt) / 1000);
                                if (sec < 60) return 'Just now';
                                const min = Math.floor(sec / 60);
                                if (min < 60) return `${min}m ago`;
                                const hr = Math.floor(min / 60);
                                if (hr < 24) return `${hr}h ago`;
                                const d = Math.floor(hr / 24);
                                if (d < 7) return `${d}d ago`;
                                return new Date(c.updatedAt).toLocaleDateString();
                            })();
                            return (
                                <View
                                    key={c.id}
                                    style={{
                                        position: 'relative', marginBottom: 2,
                                        borderRadius: 8,
                                        backgroundColor: active ? theme.colors.surface2 : 'transparent',
                                    }}
                                >
                                    <TouchableOpacity
                                        onPress={() => loadChat(c)}
                                        activeOpacity={0.7}
                                        style={{ padding: 10, paddingRight: 28 }}
                                    >
                                        <Text style={{
                                            fontFamily: theme.fonts.s, fontSize: 12,
                                            fontWeight: active ? '600' : '500',
                                            color: theme.colors.ink,
                                        }} numberOfLines={1}>
                                            {c.title}
                                        </Text>
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, marginTop: 2 }}>
                                            {ago}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => deleteChat(c.id)}
                                        style={{
                                            position: 'absolute', right: 6, top: 8,
                                            padding: 4, borderRadius: 4,
                                        }}
                                        title="Delete chat"
                                    >
                                        <Trash2 size={11} color={theme.colors.ink3} />
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </ScrollView>
                </View>
            )}

            {/* ── Main panel ── */}
            <View style={{ flex: 1, flexDirection: 'column' }}>

                {/* Header with mode pills + status */}
                <View style={{
                    paddingVertical: 12, paddingHorizontal: 20,
                    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                }}>
                    <View style={{
                        width: 38, height: 38, borderRadius: 10,
                        backgroundColor: theme.colors.ink,
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Sparkles size={18} color="#fff" strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '700', color: theme.colors.ink }}>
                            Option AI Tutor
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={{ color: SEM.green, fontSize: 11 }}>●</Text>
                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: SEM.green }}>
                                Online · Knows your grades and schedule
                            </Text>
                        </View>
                    </View>

                    {/* Mode pills */}
                    <View style={{
                        flexDirection: 'row', gap: 4,
                        backgroundColor: theme.colors.surface2,
                        padding: 3, borderRadius: 8,
                    }}>
                        {MODES.map((m) => {
                            const active = mode === m.id;
                            const Icon = m.icon;
                            return (
                                <TouchableOpacity
                                    key={m.id}
                                    onPress={() => loadMode(m.id)}
                                    activeOpacity={0.85}
                                    style={{
                                        paddingHorizontal: 12, paddingVertical: 6,
                                        borderRadius: 6,
                                        backgroundColor: active ? theme.colors.surface : 'transparent',
                                        flexDirection: 'row', alignItems: 'center', gap: 5,
                                        ...(active ? theme.shadows.sm : {}),
                                    }}
                                >
                                    <Icon size={12} color={active ? theme.colors.ink : theme.colors.ink3} />
                                    <Text style={{
                                        fontFamily: theme.fonts.s, fontSize: 11, fontWeight: '600',
                                        color: active ? theme.colors.ink : theme.colors.ink3,
                                    }}>
                                        {m.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <TouchableOpacity onPress={refreshCurrentMode} style={{ padding: 6 }}>
                        <RefreshCw size={16} color={theme.colors.ink3} />
                    </TouchableOpacity>
                </View>

                {/* Content / Messages */}
                <ScrollView
                    ref={bottomRef}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ padding: 20, paddingBottom: 12 }}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={{ maxWidth: 760, alignSelf: 'center', width: '100%' }}>

                        {/* CHAT MODE */}
                        {mode === 'chat' && (
                            <>
                                {chatMessages.length === 0 && !chatLoading && (
                                    <View style={{
                                        alignItems: 'center', justifyContent: 'center',
                                        minHeight: 360,
                                        paddingVertical: 24,
                                    }}>
                                        <View style={{
                                            width: 56, height: 56, borderRadius: 28,
                                            backgroundColor: theme.colors.ink,
                                            alignItems: 'center', justifyContent: 'center',
                                            marginBottom: 14,
                                        }}>
                                            <Sparkles size={26} color="#fff" />
                                        </View>
                                        <Text style={{ fontFamily: theme.fonts.d, fontSize: 22, fontWeight: '700', color: theme.colors.ink, marginBottom: 6 }}>
                                            Hi — I'm your Option AI Tutor
                                        </Text>
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, textAlign: 'center', maxWidth: 420 }}>
                                            I know your grades, assignments, and study patterns. Ask me anything academic — or pick a mode above.
                                        </Text>
                                    </View>
                                )}
                                {chatMessages.map((m, i) => (
                                    <Bubble key={i} role={m.role}>
                                        <Text style={{
                                            fontFamily: theme.fonts.m, fontSize: 14, lineHeight: 21,
                                            color: m.role === 'user' ? theme.colors.bg : theme.colors.ink,
                                        }}>
                                            {(m.content || '').split('**').map((part, j) =>
                                                j % 2 === 1 ? <Text key={j} style={{ fontWeight: '700' }}>{part}</Text> : part
                                            )}
                                        </Text>
                                        {m.suggestions?.length > 0 && (
                                            <View style={{ marginTop: 10, gap: 6 }}>
                                                {m.suggestions.map((s, j) => (
                                                    <TouchableOpacity key={j} onPress={() => handleSendChat(s)} style={{
                                                        flexDirection: 'row', alignItems: 'center', gap: 6,
                                                        paddingVertical: 6, paddingHorizontal: 10,
                                                        backgroundColor: theme.colors.surface2,
                                                        borderRadius: 8, alignSelf: 'flex-start',
                                                    }}>
                                                        <ArrowRight size={11} color={theme.colors.ink3} />
                                                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 12, color: theme.colors.ink2, fontWeight: '500' }}>
                                                            {s}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        )}
                                        {m.tip && (
                                            <View style={{
                                                flexDirection: 'row', alignItems: 'flex-start', gap: 6,
                                                marginTop: 10, padding: 10,
                                                backgroundColor: SEM.gold + '12',
                                                borderRadius: 8,
                                            }}>
                                                <Sparkles size={12} color={SEM.gold} style={{ marginTop: 2 }} />
                                                <Text style={{ flex: 1, fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2, lineHeight: 17 }}>
                                                    {m.tip}
                                                </Text>
                                            </View>
                                        )}
                                    </Bubble>
                                ))}
                                {chatLoading && (
                                    <View style={{ flexDirection: 'row', gap: 12 }}>
                                        <Avatar role="ai" />
                                        <View style={{
                                            padding: 14, paddingHorizontal: 16,
                                            backgroundColor: theme.colors.surface,
                                            borderWidth: 1, borderColor: theme.colors.border,
                                            borderRadius: 14, borderTopLeftRadius: 4,
                                            ...theme.shadows.sm,
                                        }}>
                                            <View style={{ flexDirection: 'row', gap: 4 }}>
                                                {[0, 1, 2].map((i) => (
                                                    <View key={i} style={{
                                                        width: 6, height: 6, borderRadius: 3,
                                                        backgroundColor: theme.colors.ink3,
                                                    }} />
                                                ))}
                                            </View>
                                        </View>
                                    </View>
                                )}
                            </>
                        )}

                        {/* BRIEFING MODE */}
                        {mode === 'briefing' && (
                            <View>
                                {tabLoading && <LoadingMessage theme={theme} message="Analyzing your day…" />}
                                {!tabLoading && !briefing && (
                                    <Bubble role="ai">
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink }}>
                                            Tap "Briefing" again to load your daily plan.
                                        </Text>
                                    </Bubble>
                                )}
                                {!tabLoading && briefing && (
                                    <BriefingView briefing={briefing} theme={theme} onAddToCalendar={addBlockToCalendar} />
                                )}
                            </View>
                        )}

                        {/* PLAN MODE */}
                        {mode === 'plan' && (
                            <View>
                                {tabLoading && <LoadingMessage theme={theme} message="Building your study plan…" />}
                                {!tabLoading && studyPlan && (
                                    <PlanView plan={studyPlan} theme={theme} onAddToCalendar={addBlockToCalendar} />
                                )}
                            </View>
                        )}

                        {/* REPORT MODE */}
                        {mode === 'report' && (
                            <View>
                                {tabLoading && <LoadingMessage theme={theme} message="Generating weekly report…" />}
                                {!tabLoading && weeklyReport && (
                                    <ReportView report={weeklyReport} theme={theme} />
                                )}
                            </View>
                        )}
                    </View>
                </ScrollView>

                {/* ── Input bar (chat mode only) ── */}
                {mode === 'chat' && (
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <View style={{
                            padding: 16, paddingHorizontal: 28,
                            borderTopWidth: 1, borderTopColor: theme.colors.border,
                            backgroundColor: theme.colors.surface,
                        }}>
                            <View style={{ maxWidth: 760, alignSelf: 'center', width: '100%' }}>
                                {chatMessages.length <= 1 && (
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                                        {SUGGESTIONS.map((s) => (
                                            <TouchableOpacity
                                                key={s}
                                                onPress={() => handleSendChat(s)}
                                                style={{
                                                    paddingHorizontal: 12, paddingVertical: 7,
                                                    backgroundColor: theme.colors.bg,
                                                    borderWidth: 1, borderColor: theme.colors.border,
                                                    borderRadius: 9999,
                                                }}
                                            >
                                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2 }}>
                                                    {s}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                                <View style={{
                                    flexDirection: 'row', alignItems: 'center', gap: 6,
                                    backgroundColor: theme.colors.bg,
                                    borderWidth: 1, borderColor: theme.colors.border,
                                    borderRadius: 12,
                                    padding: 8, paddingLeft: 14,
                                }}>
                                    <Paperclip size={16} color={theme.colors.ink3} />
                                    <TextInput
                                        value={chatInput}
                                        onChangeText={setChatInput}
                                        onSubmitEditing={() => handleSendChat()}
                                        placeholder="Ask about grades, assignments, or study tips…"
                                        placeholderTextColor={theme.colors.ink3}
                                        style={{
                                            flex: 1, paddingVertical: 6,
                                            fontFamily: theme.fonts.m, fontSize: 14,
                                            color: theme.colors.ink,
                                            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                                        }}
                                    />
                                    <TouchableOpacity
                                        onPress={() => handleSendChat()}
                                        disabled={!chatInput.trim() || chatLoading}
                                        style={{
                                            width: 32, height: 32, borderRadius: 8,
                                            backgroundColor: chatInput.trim() ? theme.colors.ink : theme.colors.surface2,
                                            alignItems: 'center', justifyContent: 'center',
                                        }}
                                    >
                                        <ArrowUp size={14} color={chatInput.trim() ? '#fff' : theme.colors.ink3} />
                                    </TouchableOpacity>
                                </View>
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, marginTop: 8, textAlign: 'center' }}>
                                    Option AI can make mistakes. Verify important info.
                                </Text>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                )}
            </View>
        </View>
    );
}

// ── Loading message helper ──────────────────────────────────
function LoadingMessage({ theme, message }) {
    return (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 32, justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.ink3} size="small" />
            <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3 }}>{message}</Text>
        </View>
    );
}

// ── Briefing renderer (chat-bubble style) ──────────────────
function BriefingView({ briefing, theme, onAddToCalendar }) {
    const isAI = briefing.source === 'ai';
    return (
        <View>
            {/* AI bubble: greeting */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <View style={{
                    width: 32, height: 32, borderRadius: 8, backgroundColor: theme.colors.ink,
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                    <Sparkles size={15} color="#fff" />
                </View>
                <View style={{ flex: 1, gap: 12 }}>
                    <Card padding={16}>
                        <Text style={{ fontFamily: theme.fonts.d, fontSize: 17, fontWeight: '700', color: theme.colors.ink, marginBottom: 6 }}>
                            {isAI ? briefing.greeting : (briefing.greeting + '!')}
                        </Text>
                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink2, lineHeight: 19 }}>
                            {briefing.summary}
                        </Text>
                    </Card>

                    {isAI && briefing.priorities?.length > 0 && (
                        <Card padding={16}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                <Target size={14} color={SEM.purple} />
                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink }}>
                                    Today's priorities
                                </Text>
                            </View>
                            {briefing.priorities.map((p, i) => {
                                const ucol = p.urgency === 'critical' ? SEM.red : p.urgency === 'high' ? SEM.orange : p.urgency === 'medium' ? SEM.blue : theme.colors.ink3;
                                return (
                                    <View key={i} style={{
                                        marginTop: i > 0 ? 10 : 0,
                                        padding: 12,
                                        backgroundColor: theme.colors.surface2 + '70',
                                        borderRadius: 8,
                                    }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ucol }} />
                                            <Text style={{ flex: 1, fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink }}>
                                                {p.title}
                                            </Text>
                                            <Badge color={ucol}>{p.urgency}</Badge>
                                        </View>
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginBottom: 6 }}>
                                            {p.reason}
                                        </Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Zap size={11} color={SEM.gold} />
                                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 12, color: theme.colors.ink2, fontWeight: '600' }}>
                                                {p.suggestedAction}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </Card>
                    )}

                    {isAI && briefing.studyPlan?.length > 0 && (
                        <Card padding={16}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                <Clock size={14} color={SEM.blue} />
                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink }}>
                                    Suggested schedule
                                </Text>
                            </View>
                            {briefing.studyPlan.map((b, i) => (
                                <View key={i} style={{ flexDirection: 'row', gap: 12, paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: theme.colors.border, alignItems: 'center' }}>
                                    <View style={{ width: 70 }}>
                                        <Text style={{ fontFamily: theme.fonts.mono, fontSize: 12, fontWeight: '600', color: theme.colors.ink }}>
                                            {b.time}
                                        </Text>
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3 }}>
                                            {b.duration}
                                        </Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink }}>
                                            {b.task}
                                        </Text>
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 2 }}>
                                            {b.tip}
                                        </Text>
                                    </View>
                                    {onAddToCalendar && (
                                        <TouchableOpacity
                                            onPress={() => onAddToCalendar(b)}
                                            style={{
                                                flexDirection: 'row', alignItems: 'center', gap: 4,
                                                paddingHorizontal: 8, paddingVertical: 5,
                                                backgroundColor: theme.colors.surface2,
                                                borderRadius: 6,
                                            }}
                                            title="Add to Google Calendar"
                                        >
                                            <CalendarPlus size={11} color={theme.colors.ink2} />
                                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 10, fontWeight: '600', color: theme.colors.ink2 }}>
                                                Add
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))}
                        </Card>
                    )}

                    {briefing.alerts?.length > 0 && briefing.alerts.map((a, i) => {
                        const c = a.type === 'danger' ? SEM.red : a.type === 'warning' ? SEM.orange : a.type === 'success' ? SEM.green : SEM.blue;
                        return (
                            <View key={i} style={{
                                flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                                padding: 12,
                                borderLeftWidth: 3, borderLeftColor: c,
                                backgroundColor: c + '12',
                                borderRadius: 8,
                            }}>
                                <AlertCircle size={14} color={c} style={{ marginTop: 2 }} />
                                <Text style={{ flex: 1, fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2, lineHeight: 17 }}>
                                    {a.message}
                                </Text>
                            </View>
                        );
                    })}

                    {(isAI ? briefing.motivation : null) && (
                        <View style={{
                            flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                            padding: 12, backgroundColor: SEM.gold + '12', borderRadius: 8,
                        }}>
                            <Sparkles size={14} color={SEM.gold} style={{ marginTop: 1 }} />
                            <Text style={{ flex: 1, fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink, lineHeight: 18 }}>
                                {briefing.motivation}
                            </Text>
                        </View>
                    )}

                    {(isAI ? briefing.topTip : briefing.tips?.[0]) && (
                        <Card padding={14}>
                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                                AI Tip
                            </Text>
                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink, lineHeight: 18 }}>
                                {isAI ? briefing.topTip : briefing.tips[0]}
                            </Text>
                        </Card>
                    )}
                </View>
            </View>
        </View>
    );
}

// ── Plan renderer ──────────────────────────────────────────
function PlanView({ plan, theme, onAddToCalendar }) {
    return (
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <View style={{
                width: 32, height: 32, borderRadius: 8, backgroundColor: theme.colors.ink,
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
                <Sparkles size={15} color="#fff" />
            </View>
            <View style={{ flex: 1, gap: 12 }}>
                <Card padding={16}>
                    <Text style={{ fontFamily: theme.fonts.d, fontSize: 17, fontWeight: '700', color: theme.colors.ink, marginBottom: 4 }}>
                        Today's Study Plan
                    </Text>
                    {plan.overview && (
                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink2, lineHeight: 19 }}>
                            {plan.overview}
                        </Text>
                    )}
                    {plan.totalStudyTime && (
                        <View style={{ marginTop: 8 }}>
                            <Badge color={SEM.blue}>{plan.totalStudyTime} total</Badge>
                        </View>
                    )}
                </Card>

                {plan.blocks?.length > 0 && (
                    <Card padding={16}>
                        {plan.blocks.map((b, i) => (
                            <View key={i} style={{
                                flexDirection: 'row', gap: 12, paddingVertical: 10,
                                borderTopWidth: i > 0 ? 1 : 0, borderTopColor: theme.colors.border,
                                alignItems: 'center',
                            }}>
                                <View style={{ width: 80 }}>
                                    <Text style={{ fontFamily: theme.fonts.mono, fontSize: 12, fontWeight: '600', color: theme.colors.ink }}>
                                        {b.startTime}
                                    </Text>
                                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, marginTop: 1 }}>
                                        → {b.endTime}
                                    </Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink }}>
                                        {b.task}
                                    </Text>
                                    {b.technique && (
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 2 }}>
                                            🧠 {b.technique}
                                        </Text>
                                    )}
                                    {b.reason && (
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 2 }}>
                                            {b.reason}
                                        </Text>
                                    )}
                                    {b.breakAfter && (
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: SEM.orange, marginTop: 4 }}>
                                            {b.breakAfter}
                                        </Text>
                                    )}
                                </View>
                                {onAddToCalendar && (
                                    <TouchableOpacity
                                        onPress={() => onAddToCalendar(b)}
                                        style={{
                                            flexDirection: 'row', alignItems: 'center', gap: 4,
                                            paddingHorizontal: 10, paddingVertical: 6,
                                            backgroundColor: theme.colors.ink,
                                            borderRadius: 8,
                                        }}
                                        title="Add to Google Calendar"
                                    >
                                        <CalendarPlus size={12} color={theme.colors.bg} />
                                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 11, fontWeight: '600', color: theme.colors.bg }}>
                                            Add
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))}
                    </Card>
                )}

                {plan.tips?.length > 0 && (
                    <Card padding={14}>
                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                            Tips
                        </Text>
                        {plan.tips.map((t, i) => (
                            <Text key={i} style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2, marginBottom: 4 }}>
                                • {t}
                            </Text>
                        ))}
                    </Card>
                )}
            </View>
        </View>
    );
}

// ── Report renderer ────────────────────────────────────────
function ReportView({ report, theme }) {
    const isAI = report.source === 'ai';
    return (
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <View style={{
                width: 32, height: 32, borderRadius: 8, backgroundColor: theme.colors.ink,
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
                <Sparkles size={15} color="#fff" />
            </View>
            <View style={{ flex: 1, gap: 12 }}>
                <Card padding={20}>
                    {isAI && report.overallGrade && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                            <View style={{
                                width: 56, height: 56, borderRadius: 12,
                                backgroundColor: SEM.green + '18',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Text style={{ fontFamily: theme.fonts.d, fontSize: 22, fontWeight: '700', color: SEM.green }}>
                                    {report.overallGrade}
                                </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1 }}>
                                    Week grade
                                </Text>
                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.ink, marginTop: 4 }}>
                                    {isAI ? report.headline : report.assessment}
                                </Text>
                            </View>
                        </View>
                    )}
                    {!isAI && (
                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink, lineHeight: 18 }}>
                            {report.assessment}
                        </Text>
                    )}
                </Card>

                {isAI && report.wins?.length > 0 && (
                    <Card padding={16}>
                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink, marginBottom: 10 }}>
                            Wins this week
                        </Text>
                        {report.wins.map((w, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: i > 0 ? 8 : 0 }}>
                                <CheckCircle size={14} color={SEM.green} style={{ marginTop: 2 }} />
                                <Text style={{ flex: 1, fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2, lineHeight: 17 }}>
                                    {w}
                                </Text>
                            </View>
                        ))}
                    </Card>
                )}

                {isAI && report.improvements?.length > 0 && (
                    <Card padding={16}>
                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink, marginBottom: 10 }}>
                            Areas to improve
                        </Text>
                        {report.improvements.map((imp, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: i > 0 ? 8 : 0 }}>
                                <ArrowRight size={14} color={SEM.orange} style={{ marginTop: 2 }} />
                                <Text style={{ flex: 1, fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2, lineHeight: 17 }}>
                                    {imp}
                                </Text>
                            </View>
                        ))}
                    </Card>
                )}

                {report.encouragement && (
                    <View style={{
                        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                        padding: 12, backgroundColor: SEM.gold + '12', borderRadius: 8,
                    }}>
                        <Sparkles size={14} color={SEM.gold} style={{ marginTop: 1 }} />
                        <Text style={{ flex: 1, fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink, lineHeight: 18 }}>
                            {report.encouragement}
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
}

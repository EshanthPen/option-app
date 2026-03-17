import React, { useState, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    TextInput, Modal, ActivityIndicator, Image, Platform, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Trophy, UserPlus, Copy, X, TrendingUp, TrendingDown, Minus, Crown, Medal, Award } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import {
    getFriendLeaderboard, getSchoolLeaderboard, getGlobalLeaderboard,
    lookupByFriendCode, addFriend, getOrCreateProfile, PRESET_AVATARS,
} from '../utils/profileService';
import { supabase } from '../supabaseClient';
import * as Clipboard from 'expo-clipboard';

const TABS = ['Friends', 'School', 'Global'];
const PERIODS = ['weekly', 'monthly'];
const PERIOD_LABELS = { weekly: 'This Week', monthly: 'This Month' };

export default function LeaderboardScreen() {
    const { theme } = useTheme();
    const styles = getStyles(theme);

    const [activeTab, setActiveTab] = useState('Friends');
    const [period, setPeriod] = useState('weekly');
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [myProfile, setMyProfile] = useState(null);

    // Add friend modal
    const [showAddFriend, setShowAddFriend] = useState(false);
    const [friendCode, setFriendCode] = useState('');
    const [addingFriend, setAddingFriend] = useState(false);
    const [addFriendMsg, setAddFriendMsg] = useState('');

    const loadLeaderboard = useCallback(async () => {
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            setIsAuthenticated(!!session?.user?.id);

            if (!session?.user?.id) {
                setEntries([]);
                setLoading(false);
                return;
            }

            const profile = await getOrCreateProfile();
            setMyProfile(profile);

            let data = [];
            if (activeTab === 'Friends') {
                data = await getFriendLeaderboard(period);
            } else if (activeTab === 'School') {
                data = await getSchoolLeaderboard(period);
            } else {
                data = await getGlobalLeaderboard(period);
            }

            setEntries(data);
        } catch (err) {
            console.error('Leaderboard load error:', err);
        }
        setLoading(false);
    }, [activeTab, period]);

    useFocusEffect(
        useCallback(() => {
            loadLeaderboard();
        }, [loadLeaderboard])
    );

    const handleAddFriend = async () => {
        if (friendCode.trim().length < 4) {
            setAddFriendMsg('Enter a valid friend code');
            return;
        }

        setAddingFriend(true);
        setAddFriendMsg('');

        const found = await lookupByFriendCode(friendCode.trim());
        if (!found) {
            setAddFriendMsg('No user found with that code');
            setAddingFriend(false);
            return;
        }

        const result = await addFriend(found.user_id);
        if (result.success) {
            setAddFriendMsg(`Added ${found.display_name}!`);
            setFriendCode('');
            loadLeaderboard();
            setTimeout(() => setShowAddFriend(false), 1200);
        } else {
            setAddFriendMsg(result.error || 'Failed to add friend');
        }
        setAddingFriend(false);
    };

    const copyFriendCode = async () => {
        if (myProfile?.friend_code) {
            if (Platform.OS === 'web') {
                try { await navigator.clipboard.writeText(myProfile.friend_code); } catch {}
            } else {
                await Clipboard.setStringAsync(myProfile.friend_code);
            }
            Alert.alert('Copied!', `Your friend code: ${myProfile.friend_code}`);
        }
    };

    const renderAvatar = (item, size = 44) => {
        if (item.avatar_url) {
            return <Image source={{ uri: item.avatar_url }} style={[styles.avatar, { width: size, height: size }]} />;
        }
        if (item.avatar_preset && PRESET_AVATARS[item.avatar_preset]) {
            return (
                <View style={[styles.avatarPreset, { width: size, height: size }]}>
                    <Text style={{ fontSize: size * 0.55 }}>{PRESET_AVATARS[item.avatar_preset].emoji}</Text>
                </View>
            );
        }
        // Initials fallback
        const initials = (item.display_name || 'S').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        return (
            <View style={[styles.avatarInitials, { width: size, height: size }]}>
                <Text style={[styles.initialsText, { fontSize: size * 0.4 }]}>{initials}</Text>
            </View>
        );
    };

    const getRankIcon = (rank) => {
        if (rank === 1) return <Crown size={18} color="#D4A017" strokeWidth={2.5} />;
        if (rank === 2) return <Medal size={18} color="#9CA3AF" strokeWidth={2.5} />;
        if (rank === 3) return <Award size={18} color="#CD7F32" strokeWidth={2.5} />;
        return <Text style={styles.rankNumber}>{rank}</Text>;
    };

    const renderEntry = ({ item }) => (
        <View style={[styles.entryCard, item.isMe && styles.entryCardMe]}>
            <View style={styles.rankContainer}>
                {getRankIcon(item.rank)}
            </View>
            {renderAvatar(item)}
            <View style={styles.entryInfo}>
                <Text style={styles.entryName} numberOfLines={1}>
                    {item.display_name || 'Student'}{item.isMe ? ' (You)' : ''}
                </Text>
            </View>
            <View style={styles.scoreContainer}>
                <Text style={styles.scoreText}>{Math.round(item.score)}</Text>
            </View>
        </View>
    );

    if (!isAuthenticated) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Trophy size={28} color={theme.colors.ink} strokeWidth={2.5} />
                    <Text style={styles.headerTitle}>Leaderboard</Text>
                </View>
                <View style={styles.authPrompt}>
                    <Trophy size={48} color={theme.colors.ink3} strokeWidth={1.5} />
                    <Text style={styles.authTitle}>Sign In to Compete</Text>
                    <Text style={styles.authSubtitle}>
                        Create an account to track your focus score and compete with friends, classmates, and students worldwide.
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Trophy size={28} color={theme.colors.ink} strokeWidth={2.5} />
                    <Text style={styles.headerTitle}>Leaderboard</Text>
                </View>
                <View style={styles.headerActions}>
                    {myProfile?.friend_code && (
                        <TouchableOpacity style={styles.codeChip} onPress={copyFriendCode}>
                            <Text style={styles.codeChipText}>{myProfile.friend_code}</Text>
                            <Copy size={12} color={theme.colors.ink} strokeWidth={2.5} />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddFriend(true)}>
                        <UserPlus size={18} color={theme.colors.ink} strokeWidth={2.5} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Tab Selector */}
            <View style={styles.tabRow}>
                {TABS.map(tab => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.tab, activeTab === tab && styles.tabActive]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                            {tab}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Period Toggle */}
            <View style={styles.periodRow}>
                {PERIODS.map(p => (
                    <TouchableOpacity
                        key={p}
                        style={[styles.periodBtn, period === p && styles.periodBtnActive]}
                        onPress={() => setPeriod(p)}
                    >
                        <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                            {PERIOD_LABELS[p]}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Content */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.colors.ink} />
                </View>
            ) : activeTab === 'School' && !myProfile?.school_name ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Set Your School</Text>
                    <Text style={styles.emptySubtitle}>
                        Go to Settings and add your school name to see the school leaderboard.
                    </Text>
                </View>
            ) : entries.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>No Entries Yet</Text>
                    <Text style={styles.emptySubtitle}>
                        {activeTab === 'Friends'
                            ? 'Add friends using their friend code to start competing!'
                            : 'Be the first to earn a focus score!'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={entries}
                    keyExtractor={(item) => item.user_id}
                    renderItem={renderEntry}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* Add Friend Modal */}
            <Modal visible={showAddFriend} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Add Friend</Text>
                            <TouchableOpacity onPress={() => { setShowAddFriend(false); setAddFriendMsg(''); setFriendCode(''); }}>
                                <X size={22} color={theme.colors.ink} strokeWidth={2.5} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.modalLabel}>FRIEND CODE</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={friendCode}
                            onChangeText={setFriendCode}
                            placeholder="e.g. A3BF2C"
                            placeholderTextColor={theme.colors.ink4}
                            autoCapitalize="characters"
                            maxLength={6}
                        />

                        {addFriendMsg ? (
                            <Text style={[styles.modalMsg, addFriendMsg.includes('Added') && { color: theme.colors.green }]}>
                                {addFriendMsg}
                            </Text>
                        ) : null}

                        <TouchableOpacity
                            style={[styles.modalBtn, addingFriend && { opacity: 0.6 }]}
                            onPress={handleAddFriend}
                            disabled={addingFriend}
                        >
                            <Text style={styles.modalBtnText}>
                                {addingFriend ? 'Adding...' : 'Add Friend'}
                            </Text>
                        </TouchableOpacity>

                        {myProfile?.friend_code && (
                            <View style={styles.myCodeSection}>
                                <Text style={styles.myCodeLabel}>YOUR CODE</Text>
                                <TouchableOpacity style={styles.myCodeBox} onPress={copyFriendCode}>
                                    <Text style={styles.myCodeText}>{myProfile.friend_code}</Text>
                                    <Copy size={14} color={theme.colors.ink} strokeWidth={2} />
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const getStyles = (theme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg,
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'web' ? 32 : 60,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerTitle: {
        fontFamily: theme.fonts.d,
        fontSize: 32,
        fontWeight: '700',
        color: theme.colors.ink,
        letterSpacing: -0.5,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    codeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: theme.colors.surface,
        borderWidth: 2,
        borderColor: theme.colors.border,
        borderRadius: theme.radii.r,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    codeChipText: {
        fontFamily: theme.fonts.s,
        fontSize: 12,
        color: theme.colors.ink,
        letterSpacing: 1.5,
        fontWeight: '700',
    },
    addBtn: {
        backgroundColor: theme.colors.surface,
        borderWidth: 2,
        borderColor: theme.colors.border,
        borderRadius: theme.radii.r,
        padding: 8,
        shadowColor: theme.colors.border,
        shadowOffset: { width: 3, height: 3 },
        shadowOpacity: 1,
        shadowRadius: 0,
    },

    // Tabs
    tabRow: {
        flexDirection: 'row',
        gap: 0,
        marginBottom: 12,
        borderWidth: 2,
        borderColor: theme.colors.border,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
    },
    tabActive: {
        backgroundColor: theme.colors.ink,
    },
    tabText: {
        fontFamily: theme.fonts.s,
        fontSize: 14,
        color: theme.colors.ink3,
        fontWeight: '600',
    },
    tabTextActive: {
        color: theme.colors.bg,
        fontWeight: '700',
    },

    // Period
    periodRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    periodBtn: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: theme.radii.round,
        borderWidth: 2,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
    },
    periodBtnActive: {
        backgroundColor: theme.colors.ink,
    },
    periodText: {
        fontFamily: theme.fonts.m,
        fontSize: 12,
        color: theme.colors.ink3,
        fontWeight: '500',
    },
    periodTextActive: {
        color: theme.colors.bg,
        fontWeight: '700',
    },

    // List
    listContent: {
        paddingBottom: 100,
        gap: 8,
    },
    entryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderWidth: 2,
        borderColor: theme.colors.border,
        borderRadius: theme.radii.lg,
        padding: 12,
        gap: 12,
        shadowColor: theme.colors.border,
        shadowOffset: { width: 3, height: 3 },
        shadowOpacity: 1,
        shadowRadius: 0,
    },
    entryCardMe: {
        backgroundColor: theme.colors.surface2,
        borderWidth: 3,
    },
    rankContainer: {
        width: 28,
        alignItems: 'center',
    },
    rankNumber: {
        fontFamily: theme.fonts.d,
        fontSize: 16,
        fontWeight: '700',
        color: theme.colors.ink3,
    },

    // Avatar
    avatar: {
        borderRadius: 9999,
        borderWidth: 2,
        borderColor: theme.colors.border,
    },
    avatarPreset: {
        borderRadius: 9999,
        borderWidth: 2,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarInitials: {
        borderRadius: 9999,
        borderWidth: 2,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
    },
    initialsText: {
        fontFamily: theme.fonts.d,
        color: theme.colors.bg,
        fontWeight: '700',
    },

    // Entry info
    entryInfo: {
        flex: 1,
    },
    entryName: {
        fontFamily: theme.fonts.s,
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.ink,
    },
    scoreContainer: {
        backgroundColor: theme.colors.ink,
        borderRadius: theme.radii.r,
        paddingHorizontal: 12,
        paddingVertical: 6,
        minWidth: 50,
        alignItems: 'center',
    },
    scoreText: {
        fontFamily: theme.fonts.d,
        fontSize: 18,
        fontWeight: '700',
        color: theme.colors.bg,
    },

    // States
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emptyTitle: {
        fontFamily: theme.fonts.d,
        fontSize: 24,
        fontWeight: '700',
        color: theme.colors.ink,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontFamily: theme.fonts.m,
        fontSize: 14,
        color: theme.colors.ink3,
        textAlign: 'center',
        lineHeight: 20,
    },

    // Auth prompt
    authPrompt: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    authTitle: {
        fontFamily: theme.fonts.d,
        fontSize: 28,
        fontWeight: '700',
        color: theme.colors.ink,
        marginTop: 16,
        marginBottom: 8,
    },
    authSubtitle: {
        fontFamily: theme.fonts.m,
        fontSize: 14,
        color: theme.colors.ink3,
        textAlign: 'center',
        lineHeight: 20,
    },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalCard: {
        backgroundColor: theme.colors.surface,
        borderWidth: 3,
        borderColor: theme.colors.border,
        borderRadius: theme.radii.xl,
        padding: 24,
        width: '85%',
        maxWidth: 360,
        shadowColor: theme.colors.border,
        shadowOffset: { width: 6, height: 6 },
        shadowOpacity: 1,
        shadowRadius: 0,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontFamily: theme.fonts.d,
        fontSize: 24,
        fontWeight: '700',
        color: theme.colors.ink,
    },
    modalLabel: {
        fontFamily: theme.fonts.m,
        fontSize: 10,
        color: theme.colors.ink3,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 6,
    },
    modalInput: {
        borderWidth: 2,
        borderColor: theme.colors.border,
        borderRadius: theme.radii.r,
        padding: 12,
        fontFamily: theme.fonts.s,
        fontSize: 20,
        color: theme.colors.ink,
        textAlign: 'center',
        letterSpacing: 4,
        fontWeight: '700',
        marginBottom: 12,
    },
    modalMsg: {
        fontFamily: theme.fonts.m,
        fontSize: 13,
        color: theme.colors.ink3,
        textAlign: 'center',
        marginBottom: 8,
    },
    modalBtn: {
        backgroundColor: theme.colors.ink,
        borderRadius: theme.radii.r,
        paddingVertical: 12,
        alignItems: 'center',
        shadowColor: theme.colors.border,
        shadowOffset: { width: 4, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 0,
    },
    modalBtnText: {
        fontFamily: theme.fonts.b,
        fontSize: 16,
        fontWeight: '700',
        color: theme.colors.bg,
    },
    myCodeSection: {
        marginTop: 20,
        borderTopWidth: 1,
        borderTopColor: theme.colors.surface2,
        paddingTop: 16,
    },
    myCodeLabel: {
        fontFamily: theme.fonts.m,
        fontSize: 10,
        color: theme.colors.ink3,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 6,
        textAlign: 'center',
    },
    myCodeBox: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: theme.colors.surface2,
        borderRadius: theme.radii.r,
        paddingVertical: 10,
    },
    myCodeText: {
        fontFamily: theme.fonts.d,
        fontSize: 22,
        fontWeight: '700',
        color: theme.colors.ink,
        letterSpacing: 3,
    },
});

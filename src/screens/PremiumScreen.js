import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Dimensions, Platform, Alert, Linking,
} from 'react-native';
import {
    Crown, Check, Sparkles, Zap, Star, ChevronRight, Infinity,
    Plug, Bell, TrendingUp, FileText, Flame, Palette, X, Shield,
    BarChart3, Brain,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { usePremium } from '../context/PremiumContext';
import { PRO_FEATURES } from '../utils/premium';
import { TopBar, Card, Button, Badge, SectionLabel, GradientCard, SEM } from '../components/DesignKit';

const ICON_MAP = {
    Infinity, Plug, Bell, TrendingUp, Sparkles, FileText, Flame, Palette, BarChart3, Brain,
};

export default function PremiumScreen({ navigation, onClose }) {
    const { theme } = useTheme();
    const { isPro, subscription, restorePurchases, refreshStatus } = usePremium();
    const [selectedPlan, setSelectedPlan] = useState('pro_yearly');
    const [purchasing, setPurchasing] = useState(false);

    useEffect(() => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (params.get('success') === 'true') {
                refreshStatus?.();
                Alert.alert('Welcome to Pro! 🎉', 'Your subscription is now active.');
                window.history.replaceState({}, '', '/premium');
            } else if (params.get('canceled') === 'true') {
                Alert.alert('Checkout Canceled', 'No worries — you can upgrade anytime.');
                window.history.replaceState({}, '', '/premium');
            }
        }
    }, []);

    const handlePurchase = async () => {
        if (isPro) return;
        setPurchasing(true);
        try {
            if (Platform.OS === 'web') {
                const { data: { session } } = await (await import('../supabaseClient')).supabase.auth.getSession();
                if (!session?.user) {
                    Alert.alert('Sign in required', 'Please sign in to subscribe to Pro.');
                    return;
                }
                const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://optionapp.online';
                const response = await fetch(`${baseUrl}/api/create-checkout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        planId: selectedPlan,
                        userId: session.user.id,
                        email: session.user.email,
                    }),
                });
                const result = await response.json();
                if (result.url) {
                    window.location.href = result.url;
                } else {
                    Alert.alert('Error', result.error || 'Could not start checkout.');
                }
            } else {
                Alert.alert('Coming Soon', 'In-app purchases will be available once the app is published to the App Store and Play Store.');
            }
        } catch (err) {
            console.error('Purchase error:', err);
            Alert.alert('Error', 'Something went wrong.');
        } finally { setPurchasing(false); }
    };

    const handleRestore = async () => {
        setPurchasing(true);
        try {
            await restorePurchases();
            if (isPro) Alert.alert('Restored!', 'Your Pro subscription is active.');
            else Alert.alert('No subscription', 'No active subscription was found.');
        } catch {
            Alert.alert('Error', 'Could not restore purchases.');
        } finally { setPurchasing(false); }
    };

    // ── If already Pro ─────────────────────────────────────────
    if (isPro) {
        return (
            <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
                <TopBar title="Premium" subtitle={subscription?.isBeta ? 'Beta Tester · Pro access' : 'Option Pro · all features unlocked'} />

                <ScrollView contentContainerStyle={{ paddingVertical: 28, paddingHorizontal: 32 }}>
                    <View style={{ maxWidth: 700, alignSelf: 'center', width: '100%' }}>

                        {/* Pro status hero — matches design's ink → purple gradient */}
                        <GradientCard
                            colors={[theme.colors.ink, SEM.purple]}
                            angle={135}
                            style={{
                                padding: 28, marginBottom: 20,
                                borderRadius: theme.radii.lg,
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Crown size={22} color={SEM.gold} strokeWidth={2.5} />
                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '700', color: SEM.gold, textTransform: 'uppercase', letterSpacing: 1 }}>
                                    {subscription?.isBeta ? 'Beta Tester' : 'Option Premium'}
                                </Text>
                            </View>
                            <Text style={{ fontFamily: theme.fonts.d, fontSize: 26, fontWeight: '700', color: '#fff', marginTop: 12, letterSpacing: -0.5 }}>
                                You're on Pro
                            </Text>
                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 6, lineHeight: 20 }}>
                                {subscription?.isBeta
                                    ? "Thanks for being an early supporter — your beta access runs until Sept 1, 2026."
                                    : "All features unlocked. Thank you for supporting Option!"}
                            </Text>
                            {subscription?.current_period_end && (
                                <View style={{
                                    flexDirection: 'row', gap: 24, marginTop: 18,
                                    padding: 14, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10,
                                }}>
                                    <View>
                                        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1 }}>Plan</Text>
                                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: '#fff', marginTop: 4 }}>
                                            {subscription.plan_id || 'Annual'}
                                        </Text>
                                    </View>
                                    <View>
                                        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1 }}>Renews</Text>
                                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: '#fff', marginTop: 4 }}>
                                            {new Date(subscription.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </Text>
                                    </View>
                                </View>
                            )}
                        </GradientCard>

                        {/* Pro features list */}
                        <SectionLabel>What you get</SectionLabel>
                        <Card padding={0} style={{ overflow: 'hidden' }}>
                            {PRO_FEATURES.map((feature, i, arr) => {
                                const IconComp = ICON_MAP[feature.icon] || Star;
                                return (
                                    <View key={i} style={{
                                        flexDirection: 'row', alignItems: 'center', gap: 14,
                                        padding: 14, paddingHorizontal: 18,
                                        borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                                        borderBottomColor: theme.colors.border,
                                    }}>
                                        <View style={{
                                            width: 36, height: 36, borderRadius: 9,
                                            backgroundColor: theme.colors.surface2,
                                            alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <IconComp size={18} color={theme.colors.accent} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.ink }}>
                                                {feature.title}
                                            </Text>
                                            {feature.description && (
                                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginTop: 2 }}>
                                                    {feature.description}
                                                </Text>
                                            )}
                                        </View>
                                        <View style={{
                                            width: 24, height: 24, borderRadius: 12,
                                            backgroundColor: SEM.green + '18',
                                            alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <Check size={14} color={SEM.green} strokeWidth={3} />
                                        </View>
                                    </View>
                                );
                            })}
                        </Card>

                        {!subscription?.isBeta && (
                            <View style={{ marginTop: 20 }}>
                                <Button
                                    variant="secondary"
                                    onPress={() => {
                                        if (Platform.OS === 'web')      Linking.openURL('https://billing.stripe.com/p/login/test');
                                        else if (Platform.OS === 'ios')  Linking.openURL('https://apps.apple.com/account/subscriptions');
                                        else if (Platform.OS === 'android') Linking.openURL('https://play.google.com/store/account/subscriptions');
                                    }}
                                >
                                    Manage subscription
                                </Button>
                            </View>
                        )}
                    </View>
                </ScrollView>
            </View>
        );
    }

    // ── Free user upgrade flow ─────────────────────────────────
    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
            <TopBar
                title="Upgrade to Premium"
                subtitle="Unlock the full power of academic optimization"
                actions={onClose ? <TouchableOpacity onPress={onClose}><X size={22} color={theme.colors.ink3} /></TouchableOpacity> : null}
            />

            <ScrollView contentContainerStyle={{ paddingVertical: 28, paddingHorizontal: 32 }} showsVerticalScrollIndicator={false}>
                <View style={{ maxWidth: 1000, alignSelf: 'center', width: '100%' }}>
                    <View style={{ flexDirection: 'row', gap: 24 }}>

                        {/* Left: Hero + Features grid */}
                        <View style={{ flex: 1.4 }}>

                            {/* Dark hero card */}
                            <View style={{
                                padding: 32, marginBottom: 24,
                                borderRadius: theme.radii.lg,
                                backgroundColor: theme.colors.ink,
                                overflow: 'hidden',
                            }}>
                                <View style={{
                                    width: 56, height: 56, borderRadius: 14,
                                    backgroundColor: SEM.gold + '20',
                                    alignItems: 'center', justifyContent: 'center',
                                    marginBottom: 18,
                                }}>
                                    <Crown size={28} color={SEM.gold} strokeWidth={2.5} />
                                </View>
                                <Text style={{ fontFamily: theme.fonts.d, fontSize: 30, fontWeight: '700', color: '#fff', letterSpacing: -0.5, lineHeight: 36 }}>
                                    Option Premium
                                </Text>
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 15, color: 'rgba(255,255,255,0.7)', marginTop: 8, lineHeight: 22 }}>
                                    Personalized AI coach, unlimited tasks, smart scheduling, and detailed analytics — for less than a coffee a month.
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 16, marginTop: 20 }}>
                                    {[
                                        { num: '6,000', label: 'AI requests/day' },
                                        { num: '∞',     label: 'Tasks & projects' },
                                        { num: '7d',    label: 'Free trial' },
                                    ].map((s, i) => (
                                        <View key={i} style={{ flex: 1 }}>
                                            <Text style={{ fontFamily: theme.fonts.d, fontSize: 22, fontWeight: '700', color: SEM.gold }}>
                                                {s.num}
                                            </Text>
                                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                {s.label}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </View>

                            {/* Features grid */}
                            <SectionLabel>What's included</SectionLabel>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                                {PRO_FEATURES.map((feature, i) => {
                                    const IconComp = ICON_MAP[feature.icon] || Star;
                                    return (
                                        <Card key={i} padding={16} style={{ width: '47%', flexGrow: 1 }}>
                                            <View style={{
                                                width: 36, height: 36, borderRadius: 9,
                                                backgroundColor: theme.colors.surface2,
                                                alignItems: 'center', justifyContent: 'center',
                                                marginBottom: 10,
                                            }}>
                                                <IconComp size={18} color={theme.colors.accent} />
                                            </View>
                                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink, marginBottom: 4 }}>
                                                {feature.title}
                                            </Text>
                                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, lineHeight: 16 }}>
                                                {feature.description}
                                            </Text>
                                        </Card>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Right: Plan selection sidebar */}
                        <View style={{ flex: 1, gap: 14 }}>
                            <SectionLabel>Choose your plan</SectionLabel>

                            {/* Yearly */}
                            <PlanCard
                                selected={selectedPlan === 'pro_yearly'}
                                onPress={() => setSelectedPlan('pro_yearly')}
                                name="Yearly"
                                price="$29.99"
                                period="/yr"
                                subtext="$2.50/month, billed annually"
                                badge="SAVE 50%"
                                badgeColor={SEM.green}
                            />

                            {/* Monthly */}
                            <PlanCard
                                selected={selectedPlan === 'pro_monthly'}
                                onPress={() => setSelectedPlan('pro_monthly')}
                                name="Monthly"
                                price="$4.99"
                                period="/mo"
                                subtext="Cancel anytime"
                            />

                            {/* CTA */}
                            <View style={{ marginTop: 8 }}>
                                <Button
                                    variant="gold"
                                    size="lg"
                                    icon={Zap}
                                    onPress={handlePurchase}
                                    loading={purchasing}
                                >
                                    {purchasing ? 'Processing…' : 'Start Pro'}
                                </Button>
                            </View>

                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, textAlign: 'center', marginTop: 4 }}>
                                7-day free trial · cancel anytime
                            </Text>

                            {/* Trust */}
                            <View style={{
                                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                                marginTop: 8,
                            }}>
                                <Shield size={14} color={theme.colors.ink3} />
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3 }}>
                                    {Platform.OS === 'web' ? 'Secure payment via Stripe' : 'Secure payment via App Store'}
                                </Text>
                            </View>

                            {/* Footer links */}
                            <View style={{
                                flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
                                marginTop: 16,
                                paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.colors.border,
                            }}>
                                <TouchableOpacity onPress={handleRestore}>
                                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, textDecorationLine: 'underline' }}>
                                        Restore
                                    </Text>
                                </TouchableOpacity>
                                <Text style={{ color: theme.colors.ink4 }}>·</Text>
                                <TouchableOpacity onPress={() => Linking.openURL('https://optionapp.online/terms')}>
                                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, textDecorationLine: 'underline' }}>
                                        Terms
                                    </Text>
                                </TouchableOpacity>
                                <Text style={{ color: theme.colors.ink4 }}>·</Text>
                                <TouchableOpacity onPress={() => Linking.openURL('https://optionapp.online/privacy')}>
                                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, textDecorationLine: 'underline' }}>
                                        Privacy
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

function PlanCard({ selected, onPress, name, price, period, subtext, badge, badgeColor }) {
    const { theme } = useTheme();
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.85}
            style={{
                padding: 16,
                borderRadius: theme.radii.lg,
                borderWidth: 2,
                borderColor: selected ? theme.colors.accent : theme.colors.border,
                backgroundColor: selected ? theme.colors.surface2 : theme.colors.surface,
                ...theme.shadows.sm,
            }}
        >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{
                    width: 20, height: 20, borderRadius: 10,
                    borderWidth: 2,
                    borderColor: selected ? theme.colors.accent : theme.colors.border2,
                    alignItems: 'center', justifyContent: 'center',
                    marginTop: 2,
                }}>
                    {selected && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.accent }} />}
                </View>
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '600', color: theme.colors.ink }}>
                            {name}
                        </Text>
                        {badge && <Badge color={badgeColor}>{badge}</Badge>}
                    </View>
                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginTop: 2 }}>
                        {subtext}
                    </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: theme.fonts.d, fontSize: 18, fontWeight: '700', color: theme.colors.ink }}>
                        {price}
                        <Text style={{ fontSize: 12, fontWeight: '400', color: theme.colors.ink3 }}>{period}</Text>
                    </Text>
                </View>
            </View>
        </TouchableOpacity>
    );
}

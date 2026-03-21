import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Shield, FileText, ChevronLeft } from 'lucide-react-native';

const PRIVACY_POLICY = `
Last Updated: March 2026

Option ("we", "our", "us") is committed to protecting the privacy of our users, including minors. This Privacy Policy explains how we collect, use, and safeguard your information.

1. INFORMATION WE COLLECT

Personal Information:
- Email address (for account creation)
- Display name (chosen by user)
- School name (optional, for school leaderboard)
- Date of birth (for age verification)

Educational Data:
- Grade and assignment data from StudentVUE (fetched on-demand, stored locally on your device)
- Schoology calendar data (fetched on-demand)

Usage Data:
- Focus session durations (Pomodoro timer)
- Focus scores (aggregated weekly/monthly)

We do NOT collect:
- Location data
- Device contacts
- Photos or media (unless you upload an avatar)
- Browsing history beyond blocked site preferences

2. HOW WE USE YOUR INFORMATION

- To provide grade tracking and academic productivity features
- To display leaderboard rankings (display name and focus score only)
- To sync assignments with Google Calendar (only when you explicitly connect)
- To send grade change notifications (only when enabled)

3. DATA STORAGE & SECURITY

- StudentVUE credentials are encoded before local storage and are NEVER sent to our servers. They are transmitted directly to your school district's StudentVUE server via a secure proxy.
- Google OAuth tokens are stored locally and are never shared with third parties.
- Profile data (display name, avatar, school, focus scores) is stored in our database (Supabase) with row-level security policies.
- Local data (grades, settings) is stored on your device using AsyncStorage.

4. THIRD-PARTY SERVICES

- Supabase: Database and authentication (supabase.com)
- Google Calendar API: Only accessed when you explicitly link your Google account
- StudentVUE: Your school district's grade portal, accessed with your credentials
- Schoology: Calendar data fetched from your provided URL

We do not sell, rent, or share your personal information with advertisers or data brokers.

5. CHILDREN'S PRIVACY (COPPA COMPLIANCE)

Option is designed for students aged 13 and older. Users under 13 are not permitted to create accounts. During signup, we verify that users meet the minimum age requirement.

For users aged 13-17:
- We collect only the minimum information necessary to provide our services
- Leaderboard participation shows only display names (which can be pseudonyms)
- The friend system requires mutual friend codes — users cannot be discovered by browsing
- Parents/guardians may request data deletion by contacting us

6. YOUR RIGHTS

You have the right to:
- Access your personal data
- Correct inaccurate data
- Delete your account and all associated data
- Opt out of leaderboard participation
- Disable notifications at any time
- Disconnect third-party integrations

7. DATA RETENTION

- Account data is retained until you delete your account
- Local device data is cleared upon logout
- Focus score history is retained for leaderboard purposes and deleted with your account

8. CONTACT

For privacy concerns, data deletion requests, or questions:
Email: privacy@optionapp.com
`;

const TERMS_OF_SERVICE = `
Last Updated: March 2026

By using Option ("the App"), you agree to these Terms of Service.

1. ELIGIBILITY

You must be at least 13 years old to create an account and use Option. By creating an account, you confirm that you meet this age requirement. Users under 18 represent that they have their parent's or guardian's awareness of their use of this application.

2. ACCOUNT RESPONSIBILITIES

- You are responsible for maintaining the confidentiality of your account credentials
- You must provide accurate information during registration
- You must not share your account with others
- You must not use the App to harass, bully, or harm other users

3. ACCEPTABLE USE

You agree NOT to:
- Use the App for any unlawful purpose
- Attempt to access other users' accounts or data
- Reverse engineer, decompile, or tamper with the App
- Use automated tools to scrape data or create fake accounts
- Share inappropriate or offensive content through display names or avatars
- Attempt to brute-force friend codes or enumerate users

4. EDUCATIONAL DATA

- StudentVUE credentials are stored locally on your device only
- We act as a pass-through proxy for grade data — we do not store your grades on our servers
- You are responsible for ensuring you have authorization to access your StudentVUE account
- Grade data accuracy depends on your school district's StudentVUE system

5. LEADERBOARD & SOCIAL FEATURES

- Leaderboard rankings display your chosen display name and focus score
- You can use a pseudonym as your display name
- Friend connections require exchanging friend codes — there is no public user directory
- We reserve the right to remove offensive display names or avatars

6. INTELLECTUAL PROPERTY

All content, design, and code of Option is owned by the Option team. You may not copy, modify, or distribute any part of the App without permission.

7. DISCLAIMER OF WARRANTIES

The App is provided "as is" without warranties of any kind. We do not guarantee the accuracy of grade calculations, the availability of third-party integrations, or uninterrupted service.

8. LIMITATION OF LIABILITY

Option and its developers shall not be liable for any indirect, incidental, or consequential damages arising from your use of the App, including but not limited to inaccurate grade data or missed assignments.

9. CHANGES TO TERMS

We may update these Terms at any time. Continued use of the App after changes constitutes acceptance of the new Terms.

10. CONTACT

Questions about these Terms: legal@optionapp.com
`;

export default function LegalScreen({ route }) {
    const { theme } = useTheme();
    const styles = getStyles(theme);
    const [activeTab, setActiveTab] = useState(route?.params?.tab || 'privacy');

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Shield size={24} color={theme.colors.ink} strokeWidth={2.5} />
                <Text style={styles.headerTitle}>Legal</Text>
            </View>

            <View style={styles.tabRow}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'privacy' && styles.tabActive]}
                    onPress={() => setActiveTab('privacy')}
                >
                    <Shield size={14} color={activeTab === 'privacy' ? theme.colors.bg : theme.colors.ink3} />
                    <Text style={[styles.tabText, activeTab === 'privacy' && styles.tabTextActive]}>
                        Privacy Policy
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'terms' && styles.tabActive]}
                    onPress={() => setActiveTab('terms')}
                >
                    <FileText size={14} color={activeTab === 'terms' ? theme.colors.bg : theme.colors.ink3} />
                    <Text style={[styles.tabText, activeTab === 'terms' && styles.tabTextActive]}>
                        Terms of Service
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={styles.legalText}>
                    {activeTab === 'privacy' ? PRIVACY_POLICY.trim() : TERMS_OF_SERVICE.trim()}
                </Text>
                <View style={{ height: 100 }} />
            </ScrollView>
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
        gap: 10,
        marginBottom: 20,
    },
    headerTitle: {
        fontFamily: theme.fonts.d,
        fontSize: 32,
        fontWeight: '700',
        color: theme.colors.ink,
        letterSpacing: -0.5,
    },
    tabRow: {
        flexDirection: 'row',
        gap: 0,
        marginBottom: 16,
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
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
    },
    tabActive: {
        backgroundColor: theme.colors.ink,
    },
    tabText: {
        fontFamily: theme.fonts.s,
        fontSize: 13,
        color: theme.colors.ink3,
        fontWeight: '600',
    },
    tabTextActive: {
        color: theme.colors.bg,
        fontWeight: '700',
    },
    content: {
        flex: 1,
    },
    legalText: {
        fontFamily: theme.fonts.m,
        fontSize: 13,
        color: theme.colors.ink2,
        lineHeight: 22,
    },
});

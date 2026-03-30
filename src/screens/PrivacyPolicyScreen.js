import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';

const LAST_UPDATED = 'March 29, 2026';

const PRIVACY_ACCEPTED_KEY = '@option_privacy_accepted';
const TERMS_ACCEPTED_KEY = '@option_terms_accepted';

const PRIVACY_SECTIONS = [
    {
        title: '1. Information We Collect',
        body:
            'Option collects the following categories of information to provide and improve our educational productivity services:\n\n' +
            '\u2022 Profile Information: Display name, school name, avatar selection, and friend codes you create or enter.\n\n' +
            '\u2022 Academic Data: Grades, assignments, class schedules, and GPA calculations retrieved from your connected school platforms.\n\n' +
            '\u2022 Focus Session Data: Duration, frequency, and completion status of focus/productivity sessions, including website blocking preferences.\n\n' +
            '\u2022 Device & Usage Data: App interaction patterns and preferences (such as theme selection and working hours) stored locally on your device.',
    },
    {
        title: '2. Third-Party Integrations',
        body:
            'Option integrates with the following third-party educational platforms to sync your academic data:\n\n' +
            '\u2022 StudentVUE / Synergy: Grades and assignment data are fetched using your district credentials. Your password is never stored on our servers.\n\n' +
            '\u2022 Google Classroom: Accessed via Google OAuth to retrieve coursework and calendar events.\n\n' +
            '\u2022 Canvas LMS: Assignment and grade data synced through your institution\'s Canvas API.\n\n' +
            '\u2022 Schoology: Coursework and grades retrieved via your Schoology feed URL.\n\n' +
            '\u2022 Pearson: Grade and assignment information accessed through Pearson\'s educational APIs.\n\n' +
            '\u2022 DeltaMath: Assignment completion and scores synced from your DeltaMath account.\n\n' +
            '\u2022 Khan Academy: Progress and mastery data retrieved from Khan Academy.\n\n' +
            'Each integration requires your explicit authorization. You may disconnect any integration at any time through Settings.',
    },
    {
        title: '3. How We Store Your Data',
        body:
            'Your data is stored in two locations:\n\n' +
            '\u2022 Cloud Storage (Supabase): Account profiles, leaderboard data, and synced grades are stored securely on Supabase-hosted PostgreSQL databases with row-level security policies.\n\n' +
            '\u2022 Local Storage (AsyncStorage): Theme preferences, working hours, cached credentials, and session history are stored locally on your device and are never transmitted to our servers.\n\n' +
            'All data transmitted between the app and our servers is encrypted using TLS 1.2 or higher.',
    },
    {
        title: '4. Account Deletion',
        body:
            'You have the right to delete your account and all associated data at any time. To request deletion:\n\n' +
            '\u2022 Navigate to Settings and tap "Delete Account."\n\n' +
            '\u2022 This will permanently remove your profile, grades, focus history, and leaderboard entries from our servers.\n\n' +
            '\u2022 Locally stored data will be cleared from your device.\n\n' +
            'Account deletion is irreversible. Please export any data you wish to keep before proceeding.',
    },
    {
        title: '5. Student Privacy (COPPA & FERPA)',
        body:
            'Option is designed with student privacy in mind:\n\n' +
            '\u2022 COPPA Compliance: We do not knowingly collect personal information from children under 13 without verifiable parental consent. If you are under 13, please have a parent or guardian review and accept these terms on your behalf.\n\n' +
            '\u2022 FERPA Awareness: While Option is not a school-operated service, we treat all academic records with the same care expected under FERPA. We do not share your educational data with third parties for advertising or marketing purposes.\n\n' +
            '\u2022 We do not sell, rent, or trade any student data to third parties.',
    },
    {
        title: '6. Contact Us',
        body:
            'If you have any questions or concerns about this Privacy Policy or our data practices, please contact us at:\n\n' +
            'Email: support@optionapp.dev\n\n' +
            'We aim to respond to all inquiries within 48 hours.',
    },
];

const TERMS_SECTIONS = [
    {
        title: '1. Acceptance of Terms',
        body:
            'By downloading, installing, or using Option ("the App"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not use the App.\n\n' +
            'If you are under 18 years of age, you represent that your parent or legal guardian has reviewed and agreed to these Terms on your behalf.',
    },
    {
        title: '2. Account Responsibilities',
        body:
            'You are responsible for maintaining the confidentiality of your account credentials, including any passwords or tokens used to access third-party educational platforms through Option.\n\n' +
            '\u2022 You agree to provide accurate and current information when creating your profile.\n\n' +
            '\u2022 You are solely responsible for all activity that occurs under your account.\n\n' +
            '\u2022 You agree not to share your friend code or account access with others for the purpose of misrepresenting academic performance on leaderboards.',
    },
    {
        title: '3. Educational Tool Disclaimer',
        body:
            'Option is a supplementary productivity and grade-tracking tool. It is NOT a substitute for official school communication, grading systems, or academic advising.\n\n' +
            '\u2022 Grades and assignment data displayed in Option are retrieved from third-party platforms and may not always reflect the most current information.\n\n' +
            '\u2022 Always verify grades and deadlines through your school\'s official portal.\n\n' +
            '\u2022 Option does not guarantee the accuracy, completeness, or timeliness of any academic data displayed.\n\n' +
            '\u2022 GPA calculations are estimates and may differ from your school\'s official calculations.',
    },
    {
        title: '4. Integration Limitations',
        body:
            'Option relies on third-party educational platforms (StudentVUE, Google Classroom, Canvas, Schoology, Pearson, DeltaMath, Khan Academy) to provide academic data.\n\n' +
            '\u2022 We do not control and are not responsible for the availability, accuracy, or functionality of these platforms.\n\n' +
            '\u2022 Changes to third-party APIs may temporarily or permanently affect data syncing capabilities.\n\n' +
            '\u2022 We make no guarantees that all integrations will be available at all times.\n\n' +
            '\u2022 Credential-based integrations (e.g., StudentVUE) depend on your school district\'s infrastructure and may not work for all districts.',
    },
    {
        title: '5. Termination',
        body:
            'We reserve the right to suspend or terminate your access to the App at any time, with or without cause, including but not limited to:\n\n' +
            '\u2022 Violation of these Terms of Service.\n\n' +
            '\u2022 Abuse of the leaderboard system or community features.\n\n' +
            '\u2022 Attempts to reverse-engineer, scrape, or exploit the App or its integrations.\n\n' +
            'You may terminate your account at any time by deleting it through the Settings page.',
    },
    {
        title: '6. Changes to Terms',
        body:
            'We may update these Terms of Service from time to time. When we do, we will revise the "Last Updated" date at the top of this page.\n\n' +
            '\u2022 Continued use of the App after changes are posted constitutes acceptance of the revised Terms.\n\n' +
            '\u2022 For material changes, we will make reasonable efforts to notify you through the App.\n\n' +
            'We encourage you to review these Terms periodically to stay informed about your rights and responsibilities.',
    },
];

export default function PrivacyPolicyScreen({ route }) {
    const type = route?.params?.type || 'privacy';
    const isPrivacy = type === 'privacy';

    const { theme } = useTheme();
    const styles = getStyles(theme);

    const [accepted, setAccepted] = useState(false);
    const [loading, setLoading] = useState(true);

    const storageKey = isPrivacy ? PRIVACY_ACCEPTED_KEY : TERMS_ACCEPTED_KEY;
    const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;
    const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';

    useEffect(() => {
        const checkAcceptance = async () => {
            try {
                const value = await AsyncStorage.getItem(storageKey);
                setAccepted(value === 'true');
            } catch {
                setAccepted(false);
            } finally {
                setLoading(false);
            }
        };
        checkAcceptance();
    }, [storageKey]);

    const handleAccept = useCallback(async () => {
        try {
            await AsyncStorage.setItem(storageKey, 'true');
            setAccepted(true);
            Alert.alert('Accepted', `You have accepted the ${title}.`);
        } catch {
            Alert.alert('Error', 'Could not save your acceptance. Please try again.');
        }
    }, [storageKey, title]);

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={styles.header}>{title}</Text>
            <Text style={styles.lastUpdated}>Last Updated: {LAST_UPDATED}</Text>

            {sections.map((section, index) => (
                <View key={index} style={styles.section}>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    <Text style={styles.sectionBody}>{section.body}</Text>
                </View>
            ))}

            {!loading && !accepted && (
                <View style={styles.acceptContainer}>
                    <Text style={styles.acceptPrompt}>
                        Please read and accept the {title} to continue using Option.
                    </Text>
                    <TouchableOpacity
                        style={styles.acceptButton}
                        onPress={handleAccept}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.acceptButtonText}>I Accept</Text>
                    </TouchableOpacity>
                </View>
            )}

            {!loading && accepted && (
                <View style={styles.acceptedBadge}>
                    <Text style={styles.acceptedText}>Accepted</Text>
                </View>
            )}

            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const getStyles = (theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.colors.bg,
        },
        content: {
            paddingHorizontal: 20,
            paddingTop: 40,
            paddingBottom: 40,
        },
        header: {
            fontFamily: theme.fonts.d,
            fontSize: 32,
            fontWeight: '700',
            color: theme.colors.ink,
            letterSpacing: -0.5,
            marginBottom: 4,
        },
        lastUpdated: {
            fontFamily: theme.fonts.m,
            fontSize: 12,
            color: theme.colors.ink3,
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 28,
        },
        section: {
            backgroundColor: theme.colors.surface,
            padding: 20,
            borderRadius: theme.radii.lg,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            shadowColor: '#000',
            shadowOpacity: 0.03,
            shadowRadius: 4,
            elevation: 1,
        },
        sectionTitle: {
            fontFamily: theme.fonts.d,
            fontSize: 20,
            fontWeight: '700',
            color: theme.colors.ink,
            marginBottom: 10,
        },
        sectionBody: {
            fontFamily: theme.fonts.m,
            fontSize: 15,
            color: theme.colors.ink2,
            lineHeight: 23,
        },
        acceptContainer: {
            marginTop: 12,
            alignItems: 'center',
        },
        acceptPrompt: {
            fontFamily: theme.fonts.m,
            fontSize: 14,
            color: theme.colors.ink3,
            textAlign: 'center',
            marginBottom: 16,
            lineHeight: 20,
        },
        acceptButton: {
            backgroundColor: theme.colors.ink,
            paddingVertical: 14,
            paddingHorizontal: 48,
            borderRadius: theme.radii.r,
            borderWidth: 2,
            borderColor: theme.colors.border,
            shadowColor: '#000',
            shadowOpacity: 0.08,
            shadowRadius: 6,
            elevation: 2,
        },
        acceptButtonText: {
            fontFamily: theme.fonts.b,
            fontSize: 18,
            color: theme.colors.bg,
            fontWeight: '700',
            textAlign: 'center',
            letterSpacing: 0.5,
        },
        acceptedBadge: {
            marginTop: 12,
            alignSelf: 'center',
            backgroundColor: theme.colors.surface,
            paddingVertical: 10,
            paddingHorizontal: 32,
            borderRadius: theme.radii.r,
            borderWidth: 2,
            borderColor: theme.colors.border,
        },
        acceptedText: {
            fontFamily: theme.fonts.s,
            fontSize: 16,
            color: theme.colors.ink2,
            textAlign: 'center',
            letterSpacing: 0.5,
        },
    });

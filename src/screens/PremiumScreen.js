import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import {
  Crown,
  Check,
  Sparkles,
  Zap,
  Star,
  ChevronRight,
  Infinity,
  Plug,
  Bell,
  TrendingUp,
  FileText,
  Flame,
  Palette,
  X,
  Shield,
  BarChart3,
  Brain,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { usePremium } from '../context/PremiumContext';
import { PRO_FEATURES, PLANS } from '../utils/premium';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ICON_MAP = {
  Infinity: Infinity,
  Plug: Plug,
  Bell: Bell,
  TrendingUp: TrendingUp,
  Sparkles: Sparkles,
  FileText: FileText,
  Flame: Flame,
  Palette: Palette,
  BarChart3: BarChart3,
  Brain: Brain,
};

export default function PremiumScreen({ navigation, onClose }) {
  const { theme } = useTheme();
  const { isPro, activatePremium, restorePurchases, refreshStatus } = usePremium();
  const [selectedPlan, setSelectedPlan] = useState('pro_yearly');
  const [purchasing, setPurchasing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  const styles = getStyles(theme);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();

    // Pulsing glow for CTA
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();

    // Check if returning from Stripe checkout
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('success') === 'true') {
        // Refresh premium status after successful payment
        refreshStatus?.();
        Alert.alert('Welcome to Pro! 🎉', 'Your subscription is now active. Enjoy all premium features!');
        // Clean up URL
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
        // Web: Create Stripe Checkout session and redirect
        const { data: { session } } = await (await import('../supabaseClient')).supabase.auth.getSession();
        if (!session?.user) {
          Alert.alert('Sign In Required', 'Please sign in to subscribe to Pro.');
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
          // Redirect to Stripe Checkout
          if (typeof window !== 'undefined') {
            window.location.href = result.url;
          } else {
            Linking.openURL(result.url);
          }
        } else {
          Alert.alert('Error', result.error || 'Could not start checkout. Please try again.');
        }
      } else {
        // Native: Use RevenueCat (react-native-purchases)
        // Install it when ready: npx expo install react-native-purchases
        Alert.alert(
          'Coming Soon',
          'In-app purchases will be available once the app is published to the App Store and Play Store. Stay tuned!',
          [{ text: 'OK' }]
        );
      }
    } catch (err) {
      console.error('Purchase error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setPurchasing(true);
    try {
      await restorePurchases();
      if (isPro) {
        Alert.alert('Restored!', 'Your Pro subscription is active.');
      } else {
        Alert.alert('No Subscription Found', 'No active subscription was found for this account.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not restore purchases. Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  // If already pro, show a different view
  if (isPro) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.proActiveContainer}>
          <View style={styles.proBadgeLarge}>
            <Crown size={32} color={theme.colors.orange} />
          </View>
          <Text style={styles.proActiveTitle}>You're on Option Pro</Text>
          <Text style={styles.proActiveSubtitle}>
            You have access to all premium features. Thank you for supporting Option!
          </Text>
          <View style={styles.proFeaturesList}>
            {PRO_FEATURES.map((feature, i) => {
              const IconComp = ICON_MAP[feature.icon] || Star;
              return (
                <View key={i} style={styles.proFeatureRow}>
                  <View style={styles.checkCircle}>
                    <Check size={14} color={theme.colors.green} strokeWidth={3} />
                  </View>
                  <Text style={styles.proFeatureText}>{feature.title}</Text>
                </View>
              );
            })}
          </View>
          <TouchableOpacity
            style={styles.manageBtn}
            onPress={() => {
              if (Platform.OS === 'web') {
                // Stripe Customer Portal — users manage their subscription here
                Linking.openURL('https://billing.stripe.com/p/login/test');
              } else if (Platform.OS === 'ios') {
                Linking.openURL('https://apps.apple.com/account/subscriptions');
              } else if (Platform.OS === 'android') {
                Linking.openURL('https://play.google.com/store/account/subscriptions');
              }
            }}
          >
            <Text style={styles.manageBtnText}>Manage Subscription</Text>
            <ChevronRight size={16} color={theme.colors.ink2} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const ctaOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  const ctaScale = glowAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.02, 1],
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        {/* Close button if modal */}
        {onClose && (
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <X size={22} color={theme.colors.ink3} />
          </TouchableOpacity>
        )}

        {/* Hero */}
        <View style={styles.heroSection}>
          <View style={styles.crownBadge}>
            <Crown size={28} color="#FFB800" />
          </View>
          <Text style={styles.heroTitle}>Upgrade to{'\n'}Option Pro</Text>
          <Text style={styles.heroSubtitle}>
            Unlock the full power of academic optimization
          </Text>
        </View>

        {/* Features Grid */}
        <View style={styles.featuresGrid}>
          {PRO_FEATURES.map((feature, index) => {
            const IconComp = ICON_MAP[feature.icon] || Star;
            return (
              <View key={index} style={styles.featureCard}>
                <View style={styles.featureIconWrap}>
                  <IconComp size={20} color={theme.colors.accent} />
                </View>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDesc}>{feature.description}</Text>
              </View>
            );
          })}
        </View>

        {/* Plan Selection */}
        <View style={styles.planSection}>
          <Text style={styles.planSectionTitle}>Choose your plan</Text>

          {/* Yearly */}
          <TouchableOpacity
            style={[
              styles.planCard,
              selectedPlan === 'pro_yearly' && styles.planCardSelected,
            ]}
            onPress={() => setSelectedPlan('pro_yearly')}
            activeOpacity={0.7}
          >
            <View style={styles.planCardLeft}>
              <View style={[
                styles.radioOuter,
                selectedPlan === 'pro_yearly' && styles.radioOuterSelected,
              ]}>
                {selectedPlan === 'pro_yearly' && <View style={styles.radioInner} />}
              </View>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.planName}>Yearly</Text>
                  <View style={styles.saveBadge}>
                    <Text style={styles.saveBadgeText}>SAVE 50%</Text>
                  </View>
                </View>
                <Text style={styles.planSubtext}>$2.50/month, billed annually</Text>
              </View>
            </View>
            <Text style={styles.planPrice}>$29.99<Text style={styles.planPeriod}>/yr</Text></Text>
          </TouchableOpacity>

          {/* Monthly */}
          <TouchableOpacity
            style={[
              styles.planCard,
              selectedPlan === 'pro_monthly' && styles.planCardSelected,
            ]}
            onPress={() => setSelectedPlan('pro_monthly')}
            activeOpacity={0.7}
          >
            <View style={styles.planCardLeft}>
              <View style={[
                styles.radioOuter,
                selectedPlan === 'pro_monthly' && styles.radioOuterSelected,
              ]}>
                {selectedPlan === 'pro_monthly' && <View style={styles.radioInner} />}
              </View>
              <View>
                <Text style={styles.planName}>Monthly</Text>
                <Text style={styles.planSubtext}>Cancel anytime</Text>
              </View>
            </View>
            <Text style={styles.planPrice}>$4.99<Text style={styles.planPeriod}>/mo</Text></Text>
          </TouchableOpacity>
        </View>

        {/* CTA Button */}
        <Animated.View style={{ opacity: ctaOpacity, transform: [{ scale: ctaScale }] }}>
          <TouchableOpacity
            style={[styles.ctaButton, purchasing && styles.ctaButtonDisabled]}
            onPress={handlePurchase}
            disabled={purchasing}
            activeOpacity={0.8}
          >
            <Zap size={20} color="#121212" strokeWidth={2.5} />
            <Text style={styles.ctaText}>
              {purchasing ? 'Processing...' : 'Start Pro'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Free trial note */}
        <Text style={styles.trialNote}>
          7-day free trial included. Cancel anytime.
        </Text>

        {/* Restore & Terms */}
        <View style={styles.footerLinks}>
          <TouchableOpacity onPress={handleRestore}>
            <Text style={styles.footerLink}>Restore Purchases</Text>
          </TouchableOpacity>
          <Text style={styles.footerDot}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://optionapp.online/terms')}>
            <Text style={styles.footerLink}>Terms</Text>
          </TouchableOpacity>
          <Text style={styles.footerDot}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://optionapp.online/privacy')}>
            <Text style={styles.footerLink}>Privacy</Text>
          </TouchableOpacity>
        </View>

        {/* Trust badges */}
        <View style={styles.trustSection}>
          <View style={styles.trustBadge}>
            <Shield size={14} color={theme.colors.ink3} />
            <Text style={styles.trustText}>{Platform.OS === 'web' ? 'Secure payment via Stripe' : 'Secure payment via App Store'}</Text>
          </View>
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const getStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 60,
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
  },
  closeBtn: {
    alignSelf: 'flex-end',
    padding: 8,
    marginBottom: 8,
  },

  // Hero
  heroSection: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 20,
  },
  crownBadge: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 32,
    fontFamily: theme.fonts.b,
    fontWeight: '800',
    color: theme.colors.ink,
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    fontFamily: theme.fonts.m,
    color: theme.colors.ink3,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Features Grid
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 32,
  },
  featureCard: {
    width: '47%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.colors.surface2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  featureTitle: {
    fontSize: 13,
    fontFamily: theme.fonts.s,
    fontWeight: '600',
    color: theme.colors.ink,
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 11,
    fontFamily: theme.fonts.m,
    color: theme.colors.ink3,
    lineHeight: 16,
  },

  // Plan Selection
  planSection: {
    marginBottom: 24,
  },
  planSectionTitle: {
    fontSize: 16,
    fontFamily: theme.fonts.s,
    fontWeight: '600',
    color: theme.colors.ink,
    marginBottom: 12,
  },
  planCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  planCardSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface2,
  },
  planCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.border2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: {
    borderColor: theme.colors.accent,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.accent,
  },
  planName: {
    fontSize: 15,
    fontFamily: theme.fonts.s,
    fontWeight: '600',
    color: theme.colors.ink,
  },
  planSubtext: {
    fontSize: 12,
    fontFamily: theme.fonts.m,
    color: theme.colors.ink3,
    marginTop: 2,
  },
  planPrice: {
    fontSize: 18,
    fontFamily: theme.fonts.b,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  planPeriod: {
    fontSize: 13,
    fontWeight: '400',
    color: theme.colors.ink3,
  },
  saveBadge: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  saveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.green,
    letterSpacing: 0.5,
  },

  // CTA
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFB800',
    paddingVertical: 16,
    borderRadius: 14,
    ...theme.shadows.md,
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    fontSize: 17,
    fontFamily: theme.fonts.b,
    fontWeight: '700',
    color: '#121212',
  },
  trialNote: {
    fontSize: 12,
    fontFamily: theme.fonts.m,
    color: theme.colors.ink3,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 20,
  },

  // Footer
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  footerLink: {
    fontSize: 12,
    fontFamily: theme.fonts.m,
    color: theme.colors.ink3,
    textDecorationLine: 'underline',
  },
  footerDot: {
    fontSize: 12,
    color: theme.colors.ink4,
  },
  trustSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trustText: {
    fontSize: 11,
    fontFamily: theme.fonts.m,
    color: theme.colors.ink4,
  },

  // Pro Active State
  proActiveContainer: {
    alignItems: 'center',
    paddingTop: 40,
  },
  proBadgeLarge: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  proActiveTitle: {
    fontSize: 26,
    fontFamily: theme.fonts.b,
    fontWeight: '800',
    color: theme.colors.ink,
    marginBottom: 8,
  },
  proActiveSubtitle: {
    fontSize: 14,
    fontFamily: theme.fonts.m,
    color: theme.colors.ink3,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 20,
  },
  proFeaturesList: {
    width: '100%',
    gap: 12,
    marginBottom: 28,
  },
  proFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: theme.radii.r,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  proFeatureText: {
    fontSize: 14,
    fontFamily: theme.fonts.m,
    color: theme.colors.ink,
    fontWeight: '500',
  },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.r,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  manageBtnText: {
    fontSize: 14,
    fontFamily: theme.fonts.m,
    color: theme.colors.ink2,
    fontWeight: '500',
  },
});

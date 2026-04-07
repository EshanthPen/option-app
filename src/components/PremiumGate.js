import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Crown, Lock, Zap } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { usePremium } from '../context/PremiumContext';

/**
 * Inline premium gate — shows a lock overlay when feature is not available
 * Wrap any premium-only UI section with this component
 *
 * Usage:
 *   <PremiumGate gate="grade_trends" onUpgrade={() => navigation.navigate('Premium')}>
 *     <GradeTrendChart />
 *   </PremiumGate>
 */
export function PremiumGate({ gate, children, onUpgrade, message }) {
  const { canUse } = usePremium();
  const { theme } = useTheme();
  const styles = getStyles(theme);

  if (canUse(gate)) {
    return children;
  }

  return (
    <View style={styles.gateContainer}>
      <View style={styles.lockedOverlay}>
        <View style={styles.lockBadge}>
          <Lock size={18} color="#FFB800" />
        </View>
        <Text style={styles.lockTitle}>Pro Feature</Text>
        <Text style={styles.lockMessage}>
          {message || 'Upgrade to Option Pro to unlock this feature'}
        </Text>
        <TouchableOpacity style={styles.upgradeBtn} onPress={onUpgrade} activeOpacity={0.8}>
          <Crown size={14} color="#121212" />
          <Text style={styles.upgradeBtnText}>Upgrade</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Premium badge — small badge to indicate a feature is Pro-only
 * Place next to feature labels/buttons
 */
export function ProBadge({ style }) {
  const { theme } = useTheme();
  const { isPro } = usePremium();

  if (isPro) return null;

  return (
    <View style={[{
      backgroundColor: 'rgba(255, 184, 0, 0.15)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    }, style]}>
      <Crown size={10} color="#FFB800" />
      <Text style={{
        fontSize: 9,
        fontWeight: '700',
        color: '#FFB800',
        letterSpacing: 0.5,
      }}>PRO</Text>
    </View>
  );
}

/**
 * Paywall modal — full-screen modal paywall
 */
export function PaywallModal({ visible, onClose, onUpgrade }) {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <TouchableOpacity style={styles.modalClose} onPress={onClose}>
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>

          <View style={styles.modalCrown}>
            <Crown size={32} color="#FFB800" />
          </View>

          <Text style={styles.modalTitle}>Unlock this feature</Text>
          <Text style={styles.modalSubtitle}>
            This is a Pro feature. Upgrade to get unlimited access to all premium features.
          </Text>

          <View style={styles.modalFeatures}>
            {['Unlimited tasks & integrations', 'Grade notifications & trends', 'AI smart prioritization', 'All themes & PDF export'].map((f, i) => (
              <View key={i} style={styles.modalFeatureRow}>
                <Zap size={14} color={theme.colors.accent} />
                <Text style={styles.modalFeatureText}>{f}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.modalCta} onPress={onUpgrade} activeOpacity={0.8}>
            <Text style={styles.modalCtaText}>Upgrade to Pro</Text>
          </TouchableOpacity>

          <Text style={styles.modalTrialText}>
            7-day free trial · Cancel anytime
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (theme) => StyleSheet.create({
  // Inline Gate
  gateContainer: {
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  lockedOverlay: {
    backgroundColor: theme.colors.surface,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
  },
  lockBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 184, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  lockTitle: {
    fontSize: 15,
    fontFamily: theme.fonts.s,
    fontWeight: '600',
    color: theme.colors.ink,
    marginBottom: 4,
  },
  lockMessage: {
    fontSize: 12,
    fontFamily: theme.fonts.m,
    color: theme.colors.ink3,
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 18,
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFB800',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  upgradeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#121212',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    paddingBottom: 40,
    alignItems: 'center',
  },
  modalClose: {
    alignSelf: 'flex-end',
    padding: 4,
  },
  modalCloseText: {
    fontSize: 18,
    color: theme.colors.ink3,
  },
  modalCrown: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: theme.fonts.b,
    fontWeight: '700',
    color: theme.colors.ink,
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: theme.fonts.m,
    color: theme.colors.ink3,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  modalFeatures: {
    width: '100%',
    gap: 10,
    marginBottom: 24,
  },
  modalFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalFeatureText: {
    fontSize: 14,
    fontFamily: theme.fonts.m,
    color: theme.colors.ink2,
  },
  modalCta: {
    width: '100%',
    backgroundColor: '#FFB800',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    ...theme.shadows.md,
  },
  modalCtaText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#121212',
  },
  modalTrialText: {
    fontSize: 11,
    color: theme.colors.ink4,
    marginTop: 10,
  },
});

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';
import { PREMIUM_GATES, isFeatureAvailable, getTaskLimit, getIntegrationLimit } from '../utils/premium';

const PremiumContext = createContext();

const STORAGE_KEY = '@OptionApp_Premium';

// ── Beta Tester Program ──────────────────────────────────────────
// Emails listed here get free temporary Pro access until BETA_ACCESS_UNTIL.
// To add a beta tester, add their email (lowercase, trimmed) to the array.
// To end the beta early, set BETA_ACCESS_UNTIL to a past date.
// Case-insensitive match — comparison is done on the lowercased email.
const BETA_TESTERS = [
  'eshanthpenumatsa@gmail.com',
  'joshua.umapathi@gmail.com',
  'ramineni.aarav@gmail.com',
  'shaunakkanagal@gmail.com',
  'talk2rithiks@gmail.com',
];
const BETA_ACCESS_UNTIL = '2026-09-01T00:00:00Z'; // ISO date when beta access expires

const isBetaTester = (email) => {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return BETA_TESTERS.includes(normalized);
};

const betaAccessActive = () => {
  return new Date(BETA_ACCESS_UNTIL) > new Date();
};

export const PremiumProvider = ({ children }) => {
  const [isPro, setIsPro] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load premium status from local cache first, then verify with Supabase
  useEffect(() => {
    loadPremiumStatus();
  }, []);

  const loadPremiumStatus = async () => {
    try {
      // Quick load from cache
      const cached = await AsyncStorage.getItem(STORAGE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        // Check if cached subscription is still valid
        if (data.expiresAt && new Date(data.expiresAt) > new Date()) {
          setIsPro(true);
          setSubscription(data);
        }
      }

      // Verify with Supabase
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // ── Beta tester override ─────────────────────────────────
        // If the signed-in email is in the beta tester list and the
        // program hasn't ended, grant Pro for free. Runs BEFORE the
        // subscriptions query so a tester never hits the DB check.
        if (isBetaTester(session.user.email) && betaAccessActive()) {
          const betaSub = {
            user_id: session.user.id,
            plan_id: 'beta',
            status: 'active',
            isBeta: true,
            current_period_start: new Date().toISOString(),
            current_period_end: BETA_ACCESS_UNTIL,
          };
          setIsPro(true);
          setSubscription(betaSub);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...betaSub,
            expiresAt: BETA_ACCESS_UNTIL,
          }));
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('status', 'active')
          .single();

        if (data && !error) {
          const isActive = new Date(data.current_period_end) > new Date();
          setIsPro(isActive);
          setSubscription(data);
          // Update cache
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...data,
            expiresAt: data.current_period_end,
          }));
        } else {
          // No active subscription in DB
          setIsPro(false);
          setSubscription(null);
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (err) {
      console.log('Premium status check:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Activate premium (called after successful purchase)
  const activatePremium = useCallback(async (planId, expiresAt, receiptData = null) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return false;

      const subData = {
        user_id: session.user.id,
        plan_id: planId,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: expiresAt,
        receipt_data: receiptData,
        updated_at: new Date().toISOString(),
      };

      // Upsert subscription
      const { error } = await supabase
        .from('subscriptions')
        .upsert(subData, { onConflict: 'user_id' });

      if (!error) {
        setIsPro(true);
        setSubscription(subData);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
          ...subData,
          expiresAt,
        }));
        return true;
      }
      return false;
    } catch (err) {
      console.error('Activate premium error:', err);
      return false;
    }
  }, []);

  // Restore purchases (for App Store / Play Store)
  const restorePurchases = useCallback(async () => {
    await loadPremiumStatus();
    return isPro;
  }, [isPro]);

  // Check if a specific feature is unlocked
  const canUse = useCallback((gate) => {
    return isFeatureAvailable(gate, isPro);
  }, [isPro]);

  const taskLimit = getTaskLimit(isPro);
  const integrationLimit = getIntegrationLimit(isPro);

  return (
    <PremiumContext.Provider value={{
      isPro,
      subscription,
      loading,
      activatePremium,
      restorePurchases,
      refreshStatus: loadPremiumStatus,
      canUse,
      taskLimit,
      integrationLimit,
      GATES: PREMIUM_GATES,
    }}>
      {children}
    </PremiumContext.Provider>
  );
};

export const usePremium = () => useContext(PremiumContext);

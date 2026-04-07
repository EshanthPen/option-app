/**
 * Premium feature definitions and gating logic
 *
 * FREE — everything essential for students:
 *   - Unlimited tasks & all integrations
 *   - AI daily briefing & smart prioritization
 *   - Basic study timer & calendar
 *   - Grade notifications
 *   - Classic theme
 *
 * PRO — advanced power features:
 *   - AI weekly/monthly reports
 *   - AI auto-reschedule & grade impact predictions
 *   - Grade trend charts
 *   - PDF report card export
 *   - Advanced study stats & streaks dashboard
 *   - All 6 premium themes
 */

export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: '',
    features: [
      'Unlimited tasks & integrations',
      'AI daily briefing & priorities',
      'Smart scheduling',
      'Study timer',
      'Grade notifications',
      'Calendar & Leaderboard',
      'Classic theme',
    ],
  },
  pro_monthly: {
    id: 'pro_monthly',
    name: 'Pro',
    price: '$4.99',
    period: '/month',
    stripePriceId: null,
    rcProductId: 'option_pro_monthly',
  },
  pro_yearly: {
    id: 'pro_yearly',
    name: 'Pro',
    price: '$29.99',
    period: '/year',
    savings: '50%',
    stripePriceId: null,
    rcProductId: 'option_pro_yearly',
  },
};

export const PRO_FEATURES = [
  {
    icon: 'BarChart3',
    title: 'AI Weekly Reports',
    description: 'Detailed performance analysis and recommendations',
  },
  {
    icon: 'Brain',
    title: 'AI Auto-Reschedule',
    description: 'Automatically rebalance your schedule when things change',
  },
  {
    icon: 'TrendingUp',
    title: 'Grade Impact Predictions',
    description: 'See how tasks affect your grades before deadlines',
  },
  {
    icon: 'TrendingUp',
    title: 'Grade Trend Charts',
    description: 'Visualize academic progress over time',
  },
  {
    icon: 'FileText',
    title: 'PDF Report Cards',
    description: 'Export & share professional grade reports',
  },
  {
    icon: 'Flame',
    title: 'Advanced Study Stats',
    description: 'Weekly charts, monthly comparisons, streak analytics',
  },
  {
    icon: 'Palette',
    title: 'All Themes',
    description: 'Ocean, Forest, Sunset, Midnight, Rose & more',
  },
];

// Feature gate keys
export const PREMIUM_GATES = {
  // PRO-only features
  AI_WEEKLY_REPORT: 'ai_weekly_report',
  AI_AUTO_RESCHEDULE: 'ai_auto_reschedule',
  GRADE_IMPACT: 'grade_impact',
  GRADE_TRENDS: 'grade_trends',
  PDF_EXPORT: 'pdf_export',
  ADVANCED_STATS: 'advanced_stats',
  CUSTOM_THEMES: 'custom_themes',
};

// Features that are FREE for all users
const FREE_FEATURES = [
  // Everything NOT in PREMIUM_GATES is free by default
  // Explicitly listing for clarity:
  'unlimited_tasks',
  'all_integrations',
  'ai_daily_briefing',
  'ai_prioritize',
  'smart_scheduling',
  'study_timer',
  'grade_notifications',
  'calendar',
  'leaderboard',
];

/**
 * Check if a specific feature is available for the user's plan
 */
export function isFeatureAvailable(gate, isPro) {
  if (isPro) return true;

  // Check if it's a premium-only gate
  const proGates = Object.values(PREMIUM_GATES);
  if (proGates.includes(gate)) return false;

  // Everything else is free
  return true;
}

/**
 * Get the task limit — unlimited for everyone
 */
export function getTaskLimit(isPro) {
  return Infinity;
}

/**
 * Get the integration limit — unlimited for everyone
 */
export function getIntegrationLimit(isPro) {
  return Infinity;
}

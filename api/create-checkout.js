/**
 * Stripe Checkout Session Creator
 *
 * Creates a Stripe Checkout session for Option Pro subscriptions.
 * Called from PremiumScreen when user taps "Start Pro" on web.
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRICE_MAP = {
  pro_monthly: process.env.STRIPE_MONTHLY_PRICE_ID,
  pro_yearly: process.env.STRIPE_YEARLY_PRICE_ID,
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  try {
    const { planId, userId, email } = req.body;

    if (!planId || !userId) {
      return res.status(400).json({ error: 'Missing planId or userId' });
    }

    const priceId = PRICE_MAP[planId];
    if (!priceId) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      // Pass user info so webhook can link subscription to Supabase user
      metadata: {
        supabase_user_id: userId,
        plan_id: planId,
      },
      customer_email: email || undefined,
      // Allow promotion codes for discounts
      allow_promotion_codes: true,
      // 7-day free trial
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          supabase_user_id: userId,
          plan_id: planId,
        },
      },
      // Redirect URLs
      success_url: `${req.headers.origin || 'https://optionapp.online'}/premium?success=true`,
      cancel_url: `${req.headers.origin || 'https://optionapp.online'}/premium?canceled=true`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}

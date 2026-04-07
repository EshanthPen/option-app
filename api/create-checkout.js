/**
 * Stripe Checkout Session Creator
 *
 * Creates a Stripe Checkout session for Option Pro subscriptions.
 * Called from PremiumScreen when user taps "Start Pro" on web.
 */

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Debug: check which env vars are set
  if (req.method === 'GET') {
    // List all env var names that contain STRIPE or SUPABASE (values hidden)
    const allEnvKeys = Object.keys(process.env).filter(k =>
      k.includes('STRIPE') || k.includes('SUPABASE') || k.includes('VERCEL')
    );
    return res.status(200).json({
      hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
      hasMonthlyPrice: !!process.env.STRIPE_MONTHLY_PRICE_ID,
      hasYearlyPrice: !!process.env.STRIPE_YEARLY_PRICE_ID,
      hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      keyPrefix: process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 8) + '...' : 'NOT SET',
      relevantEnvKeys: allEnvKeys,
      vercelEnv: process.env.VERCEL_ENV || 'unknown',
      vercelProject: process.env.VERCEL_PROJECT_PRODUCTION_URL || 'unknown',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(500).json({ error: 'Stripe not configured', debug: 'STRIPE_SECRET_KEY is empty' });
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeKey);

    const PRICE_MAP = {
      pro_monthly: process.env.STRIPE_MONTHLY_PRICE_ID,
      pro_yearly: process.env.STRIPE_YEARLY_PRICE_ID,
    };

    const { planId, userId, email } = req.body;

    if (!planId || !userId) {
      return res.status(400).json({ error: 'Missing planId or userId' });
    }

    const priceId = PRICE_MAP[planId];
    if (!priceId) {
      return res.status(400).json({ error: 'Invalid plan', debug: `planId=${planId}, available=${Object.keys(PRICE_MAP).join(',')}` });
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
      metadata: {
        supabase_user_id: userId,
        plan_id: planId,
      },
      customer_email: email || undefined,
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          supabase_user_id: userId,
          plan_id: planId,
        },
      },
      success_url: `${req.headers.origin || 'https://optionapp.online'}/premium?success=true`,
      cancel_url: `${req.headers.origin || 'https://optionapp.online'}/premium?canceled=true`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}

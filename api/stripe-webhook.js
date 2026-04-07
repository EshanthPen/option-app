/**
 * Stripe Webhook Handler
 *
 * Receives Stripe events and updates the Supabase subscriptions table.
 * Handles: checkout.session.completed, customer.subscription.updated,
 *          customer.subscription.deleted
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || !sig) {
    return res.status(400).json({ error: 'Missing webhook secret or signature' });
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://cmrirqwntwgmxignbrvj.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Verify the webhook signature
    const rawBody = req.body;
    const event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.supabase_user_id;
        const planId = session.metadata?.plan_id;

        if (!userId) {
          console.error('No supabase_user_id in checkout session metadata');
          break;
        }

        // Get the subscription details from Stripe
        const subscription = await stripe.subscriptions.retrieve(session.subscription);

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          plan_id: planId || 'pro_monthly',
          status: 'active',
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end || false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        console.log(`Subscription activated for user ${userId}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        let userId = subscription.metadata?.supabase_user_id;

        if (!userId) {
          const { data } = await supabase
            .from('subscriptions')
            .select('user_id')
            .eq('stripe_customer_id', subscription.customer)
            .single();

          if (!data) {
            console.error('Could not find user for subscription update');
            break;
          }
          userId = data.user_id;
        }

        const status = subscription.status === 'active' || subscription.status === 'trialing'
          ? 'active'
          : subscription.status;

        await supabase.from('subscriptions').update({
          status,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end || false,
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId);

        console.log(`Subscription updated for user ${userId}: ${status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;

        const { data } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        if (data) {
          await supabase.from('subscriptions').update({
            status: 'canceled',
            cancel_at_period_end: true,
            updated_at: new Date().toISOString(),
          }).eq('user_id', data.user_id);

          console.log(`Subscription canceled for user ${data.user_id}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).json({ error: err.message });
  }
}

// Disable Vercel's default body parsing so we get the raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}

function computeFees(bookingAmountCents: number) {
  const platformPct = Number(Deno.env.get('STYLD_PLATFORM_FEE_PERCENT') || '1') / 100;
  const platformFeeCents = Math.round(bookingAmountCents * platformPct);
  const chargeCents = Math.ceil((bookingAmountCents + 30) / (1 - 0.029 - 0.01));
  const serviceFeeCents = chargeCents - bookingAmountCents;
  const stripeFeeCents = Math.max(0, serviceFeeCents - platformFeeCents);
  return {
    bookingAmountCents,
    serviceFeeCents,
    totalChargeCents: chargeCents,
    transferAmountCents: bookingAmountCents,
    stripeFeeCents,
    platformFeeCents,
    platformFeePayer: 'client',
    stylistNetCents: bookingAmountCents,
  };
}

async function validatePromo(
  subdomain: string,
  code: string,
  subtotalCents: number,
): Promise<{ discountCents: number } | null> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!key) return null;
  const res = await fetch(`${url.replace(/\/$/, '')}/functions/v1/validate-booking-promo`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subdomain, code, subtotalCents }),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.valid) return null;
  const discountCents = Number(payload.discountCents ?? payload.discountAmountCents ?? 0);
  return { discountCents: Math.max(0, Math.min(subtotalCents, discountCents)) };
}

function readDepositPercent(settings: Record<string, unknown> | null, mode: string) {
  const payment = settings && typeof settings === 'object' ? settings : {};
  if (mode === 'full') return 100;
  const raw = payment.depositPercent ?? payment.deposit_percent ?? payment.depositPercentage;
  const pct = Number(raw);
  if (Number.isFinite(pct) && pct > 0) return pct;
  return 10;
}

async function resolveBookingAmountCents(
  body: Record<string, unknown>,
  userId: string,
  supabase: ReturnType<typeof adminClient>,
) {
  const promoCode = String(body.promoCode || body.promo_code || '').trim();
  const subtotalCents = Math.round(Number(body.subtotalCents ?? body.subtotal_cents) || 0);
  let bookingAmountCents = Math.round(Number(body.amountCents ?? body.amount_cents) || 0);

  if (promoCode && subtotalCents > 0) {
    const promo = await validatePromo(String(body.subdomain || ''), promoCode, subtotalCents);
    if (!promo) {
      throw new Error('This promo code is not valid.');
    }
    const discountedSubtotalCents = Math.max(0, subtotalCents - promo.discountCents);
    const { data: settingsRow } = await supabase
      .from('styld_site_records')
      .select('data')
      .eq('user_id', userId)
      .eq('record_type', 'site_setting')
      .eq('record_key', 'booking_payment')
      .maybeSingle();
    const settings = (settingsRow?.data || {}) as Record<string, unknown>;
    const mode = String(settings.mode || settings.payment_mode || 'deposit').toLowerCase();
    const depositPct = readDepositPercent(settings, mode);
    if (mode === 'full') {
      bookingAmountCents = discountedSubtotalCents;
    } else {
      bookingAmountCents = Math.round(discountedSubtotalCents * (depositPct / 100));
    }
  }

  if (!Number.isFinite(bookingAmountCents) || bookingAmountCents <= 0) {
    throw new Error('Invalid payment amount.');
  }
  return bookingAmountCents;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const subdomain = String(body.subdomain || '').trim().toLowerCase();
  const bookingId = String(body.bookingId || body.booking_id || '').trim();
  if (!subdomain || !bookingId) {
    return json({ error: 'Missing subdomain or bookingId' }, 400);
  }

  const stripeKey = String(Deno.env.get('STRIPE_SECRET_KEY') || '').trim();
  if (!stripeKey) {
    return json({ error: 'Stripe is not configured.' }, 500);
  }

  const supabase = adminClient();
  const { data: subRow, error: subError } = await supabase
    .from('styld_site_subdomains')
    .select('user_id')
    .eq('subdomain', subdomain)
    .maybeSingle();

  if (subError) return json({ error: subError.message }, 500);
  if (!subRow?.user_id) return json({ error: 'Site not found' }, 404);

  const { data: stripeRow, error: stripeError } = await supabase
    .from('styld_stripe_accounts')
    .select('stripe_account_id, charges_enabled')
    .eq('user_id', subRow.user_id)
    .maybeSingle();

  if (stripeError) return json({ error: stripeError.message }, 500);

  const destinationAccountId = String(stripeRow?.stripe_account_id || '').trim();
  if (!destinationAccountId || stripeRow?.charges_enabled !== true) {
    return json({ error: 'Online payments are not enabled for this pro.' }, 400);
  }

  let bookingAmountCents: number;
  try {
    bookingAmountCents = await resolveBookingAmountCents(body, String(subRow.user_id), supabase);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Invalid payment amount.' }, 400);
  }

  const fees = computeFees(bookingAmountCents);
  const stripe = new Stripe(stripeKey, { apiVersion: '2024-11-20.acacia' });

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: fees.totalChargeCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      transfer_data: {
        destination: destinationAccountId,
        amount: fees.transferAmountCents,
      },
      application_fee_amount: fees.platformFeeCents,
      metadata: {
        bookingId,
        subdomain,
        booking_amount_cents: String(fees.bookingAmountCents),
        transfer_amount_cents: String(fees.transferAmountCents),
        platform_fee_cents: String(fees.platformFeeCents),
        platform_fee_payer: 'client',
      },
      receipt_email: String(body.email || '').trim() || undefined,
      description: `Styld booking — ${subdomain}`,
    });

    return json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      subdomain,
      bookingId,
      fees,
      chargeOn: 'platform',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not start payment.';
    return json({ error: message }, 500);
  }
});

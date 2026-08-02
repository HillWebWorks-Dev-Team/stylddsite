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
  if (!subdomain) {
    return json({ error: 'Missing subdomain' }, 400);
  }

  const supabase = adminClient();
  const { data: subRow, error: subError } = await supabase
    .from('styld_site_subdomains')
    .select('user_id')
    .eq('subdomain', subdomain)
    .maybeSingle();

  if (subError) {
    return json({ error: subError.message }, 500);
  }
  if (!subRow?.user_id) {
    return json({ error: 'Site not found' }, 404);
  }

  const { data: stripeRow, error: stripeError } = await supabase
    .from('styld_stripe_accounts')
    .select('stripe_account_id, charges_enabled')
    .eq('user_id', subRow.user_id)
    .maybeSingle();

  if (stripeError) {
    return json({ error: stripeError.message }, 500);
  }

  const stripeAccountId = String(stripeRow?.stripe_account_id || '').trim();
  if (!stripeAccountId || stripeRow?.charges_enabled !== true) {
    return json({ error: 'Online payments are not enabled for this pro.' }, 400);
  }

  return json({
    subdomain,
    stripeAccountId,
    chargesEnabled: true,
  });
});

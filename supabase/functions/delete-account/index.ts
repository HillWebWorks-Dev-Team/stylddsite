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
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function verifyUserJwt(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (anonKey && token === anonKey) return null;

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return data.user.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const userId = await verifyUserJwt(req);
  if (!userId) return json({ error: 'unauthorized' }, 401);

  let body: { confirm?: boolean } = {};
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'invalid_body' }, 400);
  }

  if (body.confirm !== true) {
    return json({ error: 'confirmation_required' }, 400);
  }

  const supabase = adminClient();

  try {
    const { data: files } = await supabase.storage.from('style-covers').list(userId, { limit: 1000 });
    if (files && files.length) {
      const paths = files
        .map((f) => f.name)
        .filter(Boolean)
        .map((name) => `${userId}/${name}`);
      if (paths.length) {
        await supabase.storage.from('style-covers').remove(paths);
      }
    }
  } catch (_) {
    /* best-effort storage cleanup */
  }

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, deleted: userId });
});

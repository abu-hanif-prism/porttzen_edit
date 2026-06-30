import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, password } = await req.json() as { email?: string; password?: string };

    if (!email || !password) {
      return json({ error: 'Email and password required' }, 400);
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    // 1. Find customer
    const { data: customer, error: ce } = await sb
      .from('customers')
      .select('id, subdomain, password_hash, plan, expires_at')
      .eq('email', email)
      .single();

    if (ce || !customer) {
      return json({ error: 'Invalid email or password' }, 401);
    }

    // 2. Verify password
    const valid = await bcrypt.compare(password, customer.password_hash);
    if (!valid) {
      return json({ error: 'Invalid email or password' }, 401);
    }

    // 3. Check plan expiry
    if (customer.expires_at && new Date(customer.expires_at) < new Date()) {
      return json({ error: 'Your plan has expired. Please renew at md-hanif.xyz' }, 403);
    }

    // 4. Return existing unused token if one exists
    const { data: existing } = await sb
      .from('edit_tokens')
      .select('token, expires_at')
      .eq('customer_id', customer.id)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existing) {
      return json({ editUrl: `https://edit.md-hanif.xyz/${existing.token}` });
    }

    // 5. Generate new token (20-char hex)
    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: ie } = await sb.from('edit_tokens').insert({
      customer_id: customer.id,
      subdomain:   customer.subdomain,
      token,
      expires_at:  expiresAt,
    });

    if (ie) throw ie;

    return json({ editUrl: `https://edit.md-hanif.xyz/${token}` });
  } catch (err) {
    console.error(err);
    return json({ error: 'Internal server error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { customerId, password } = await req.json() as { customerId?: string; password?: string };

    if (!customerId || !password) {
      return json({ error: 'Subdomain and password are required' });
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const { data: customer, error: ce } = await sb
      .from('customers')
      .select('id, subdomain, password_hash, plan, expires_at, is_active')
      .eq('subdomain', customerId.toLowerCase().trim())
      .single();

    if (ce || !customer) {
      return json({ error: 'Invalid subdomain or password' });
    }

    if (customer.is_active === false) {
      return json({ error: 'Your account is inactive. Please contact support.' });
    }

    const valid = bcrypt.compareSync(password, customer.password_hash);
    if (!valid) {
      return json({ error: 'Invalid subdomain or password' });
    }

    if (customer.expires_at && new Date(customer.expires_at) < new Date()) {
      return json({ error: 'Your plan has expired. Please renew at md-hanif.xyz' });
    }

    // Reuse existing valid token if one exists
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
      return json({
        magicLink: `https://edit.md-hanif.xyz/${existing.token}`,
        expiresAt: existing.expires_at,
      });
    }

    // Generate new 20-char token
    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: ie } = await sb.from('edit_tokens').insert({
      customer_id: customer.id,
      subdomain: customer.subdomain,
      token,
      expires_at: expiresAt,
    });

    if (ie) throw ie;

    return json({ magicLink: `https://edit.md-hanif.xyz/${token}`, expiresAt });
  } catch (err) {
    console.error(err);
    return json({ error: 'Internal server error' });
  }
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

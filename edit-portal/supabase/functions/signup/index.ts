import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{1}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { name, email, subdomain, password, templateId } = await req.json() as {
      name?: string;
      email?: string;
      subdomain?: string;
      password?: string;
      templateId?: string;
    };

    if (!name?.trim()) return json({ error: 'Name is required' });
    if (!email || !email.includes('@')) return json({ error: 'Valid email is required' });
    if (!password || password.length < 8) return json({ error: 'Password must be at least 8 characters' });

    const slug = subdomain?.toLowerCase().trim() ?? '';
    if (slug.length < 3 || slug.length > 30 || !SUBDOMAIN_RE.test(slug)) {
      return json({ error: 'Subdomain must be 3–30 characters: letters, numbers, and hyphens only' });
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    // Check subdomain availability
    const { count } = await sb
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('subdomain', slug);

    if (count && count > 0) {
      return json({ error: 'That subdomain is already taken. Please choose another.' });
    }

    const passwordHash = bcrypt.hashSync(password);
    const trialEnds = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const tplId = templateId ?? 'photographer-red';

    const { data: customer, error: ce } = await sb
      .from('customers')
      .insert({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        subdomain: slug,
        password_hash: passwordHash,
        plan: 'trial',
        template_id: tplId,
        is_active: true,
        expires_at: trialEnds,
      })
      .select('id, subdomain')
      .single();

    if (ce) {
      if (ce.code === '23505') return json({ error: 'That subdomain is already taken.' });
      return json({ error: `Customer insert failed: ${ce.message} (code: ${ce.code})` });
    }

    // Create default portfolio_content — non-fatal, edit portal handles missing content
    const { error: pe } = await sb.from('portfolio_content').insert(buildDefaultContent(customer.id, slug, name.trim()));
    if (pe) console.error('portfolio_content insert failed:', pe.message);

    // Issue first edit token (24 h)
    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: te } = await sb.from('edit_tokens').insert({
      customer_id: customer.id,
      subdomain: slug,
      token,
      expires_at: tokenExpires,
    });

    if (te) return json({ error: `Token insert failed: ${te.message}` });

    return json({
      magicLink: `https://edit.md-hanif.xyz/${token}`,
      subdomain: slug,
      siteUrl: `https://${slug}.md-hanif.xyz`,
      expiresAt: tokenExpires,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('signup error:', msg);
    return json({ error: `Server error: ${msg}` });
  }
});

function buildDefaultContent(customerId: string, subdomain: string, name: string) {
  const firstName = name.split(' ')[0] ?? name;
  const lastName = name.split(' ').slice(1).join(' ');

  return {
    customer_id: customerId,
    subdomain,
    logo_text: firstName,
    hero_eyebrow: 'Portfolio',
    hero_name: firstName,
    hero_name_italic: lastName,
    hero_subtitle: 'Photographer & Visual Storyteller',
    hero_cta1_label: 'View Gallery',
    hero_cta1_href: '#gallery',
    hero_cta2_label: 'Contact Me',
    hero_cta2_href: '#contact',
    hero_images: [],
    gallery_images: Array.from({ length: 15 }, (_, i) => ({
      slot: i + 1,
      src: '',
      title: '',
      category: '',
    })),
    about_title: 'About',
    about_title_italic: 'Me',
    about_bio_1: `Hi, I'm ${name}. I'm a passionate photographer who loves capturing moments that last forever.`,
    about_quote: '"Every photograph is a certificate of presence." — Roland Barthes',
    about_bio_2: 'Available for portraits, events, and commercial projects. Feel free to reach out!',
    about_image: '',
    stats: [
      { number: '0+', label: 'Projects Completed' },
      { number: '0+', label: 'Happy Clients' },
      { number: '0+', label: 'Years Experience' },
    ],
    services: [
      { title: 'Portrait Photography', description: 'Professional portraits for individuals, couples, and families.', price: 'Contact for pricing' },
      { title: 'Event Photography', description: 'Covering weddings, corporate events, and special occasions.', price: 'Contact for pricing' },
      { title: 'Commercial Photography', description: 'Product and brand photography for your business.', price: 'Contact for pricing' },
    ],
    contact_heading: 'Get In',
    contact_heading_italic: 'Touch',
    contact_subtext: 'Available for bookings and collaborations. Let\'s create something beautiful together.',
    contact_links: [
      { label: 'Email', value: '', href: 'mailto:' },
      { label: 'Instagram', value: `@${subdomain}`, href: `https://instagram.com/${subdomain}` },
      { label: 'WhatsApp', value: '', href: 'https://wa.me/' },
    ],
    footer_name: name,
    footer_status: 'Available for bookings',
  };
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

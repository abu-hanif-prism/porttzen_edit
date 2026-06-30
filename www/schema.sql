-- PortZen Database Schema
-- Run in Supabase SQL Editor

-- ── CUSTOMERS ──────────────────────────────────────────────────────────────────
create table if not exists customers (
  id           uuid primary key default gen_random_uuid(),
  subdomain    text unique not null,
  email        text unique not null,
  password_hash text not null,
  plan         text not null default 'trial',  -- trial | standard | pro
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- ── PORTFOLIO CONTENT ──────────────────────────────────────────────────────────
create table if not exists portfolio_content (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid references customers(id) on delete cascade,
  subdomain             text unique not null,

  -- Nav
  logo_text             text,

  -- Hero
  hero_eyebrow          text,
  hero_name             text,
  hero_name_italic      text,
  hero_subtitle         text,
  hero_cta1_label       text,
  hero_cta1_href        text,
  hero_cta2_label       text,
  hero_cta2_href        text,
  hero_images           text[],   -- array of relative paths, max 5

  -- Gallery: always 15 objects [{slot:1,src:"",title:"",category:""}]
  gallery_images        jsonb not null default '[]'::jsonb,

  -- About
  about_title           text,
  about_title_italic    text,
  about_bio_1           text,
  about_quote           text,
  about_bio_2           text,
  about_image           text,

  -- Stats: always 3 [{number:"",label:""}]
  stats                 jsonb not null default '[{"number":"","label":""},{"number":"","label":""},{"number":"","label":""}]'::jsonb,

  -- Services: 1-6 [{title:"",description:"",price:""}]
  services              jsonb not null default '[]'::jsonb,

  -- Contact
  contact_heading       text,
  contact_heading_italic text,
  contact_subtext       text,

  -- Contact links: 1-8 [{label:"",value:"",href:""}]
  contact_links         jsonb not null default '[]'::jsonb,

  -- Footer
  footer_name           text,
  footer_status         text,

  updated_at            timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists portfolio_content_updated_at on portfolio_content;
create trigger portfolio_content_updated_at
  before update on portfolio_content
  for each row execute procedure update_updated_at();

-- ── EDIT TOKENS ────────────────────────────────────────────────────────────────
create table if not exists edit_tokens (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  subdomain   text not null,
  token       text unique not null,
  used        boolean not null default false,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists edit_tokens_token_idx on edit_tokens(token);

-- ── ROW LEVEL SECURITY ─────────────────────────────────────────────────────────
alter table customers       enable row level security;
alter table portfolio_content enable row level security;
alter table edit_tokens     enable row level security;

-- Anon users can read portfolio_content (for the public portfolio site)
create policy "public read portfolio_content"
  on portfolio_content for select
  to anon
  using (true);

-- Service role has full access (used by upload server + edge functions)
-- (service role bypasses RLS by default)

-- ── SEED EXAMPLE DATA ──────────────────────────────────────────────────────────
-- Replace password_hash with actual bcrypt hash before inserting.
-- Example hash for password "demo1234": use bcrypt with cost 10.

/*
insert into customers (subdomain, email, password_hash, plan, expires_at)
values (
  'elena',
  'elena@example.com',
  '$2b$10$REPLACE_WITH_REAL_BCRYPT_HASH',
  'pro',
  now() + interval '1 year'
);

insert into portfolio_content (
  customer_id, subdomain,
  logo_text, hero_eyebrow, hero_name, hero_name_italic, hero_subtitle,
  hero_cta1_label, hero_cta1_href, hero_cta2_label, hero_cta2_href,
  hero_images,
  gallery_images,
  about_title, about_title_italic,
  about_bio_1, about_quote, about_bio_2, about_image,
  stats, services, contact_heading, contact_heading_italic,
  contact_subtext, contact_links, footer_name, footer_status
)
select
  id, 'elena',
  'Elena Voss', 'Fine Art Photographer', 'Light.', 'Shadow. Story.',
  'Capturing moments that exist between reality and feeling.',
  'View Gallery', '#gallery', 'Book a session', '#contact',
  array['uploads/elena/hero_1.jpg'],
  '[{"slot":1,"src":"","title":"Portrait in Red Light","category":"Portrait"},{"slot":2,"src":"","title":"Morning Haze","category":"Landscape"},{"slot":3,"src":"","title":"The Quiet Hour","category":"Editorial"},{"slot":4,"src":"","title":"Urban Drift","category":"Street"},{"slot":5,"src":"","title":"Salt & Wind","category":"Documentary"},{"slot":6,"src":"","title":"Between Worlds","category":"Fine Art"},{"slot":7,"src":"","title":"Golden Hour","category":"Landscape"},{"slot":8,"src":"","title":"Unseen","category":"Portrait"},{"slot":9,"src":"","title":"Concrete Garden","category":"Urban"},{"slot":10,"src":"","title":"The River Knows","category":"Documentary"},{"slot":11,"src":"","title":"Ember","category":"Fine Art"},{"slot":12,"src":"","title":"Dusk Protocol","category":"Editorial"},{"slot":13,"src":"","title":"Still Life No. 7","category":"Still Life"},{"slot":14,"src":"","title":"Monsoon","category":"Documentary"},{"slot":15,"src":"","title":"Reverie","category":"Fine Art"}]',
  'A photographer who', 'chases feeling,',
  'I believe a photograph should make you feel something before you understand it.',
  '"The best photograph is the one that captures an emotion you did not know you were feeling until you saw it."',
  'Based between Berlin and Dhaka, I shoot portraits, landscapes, and long-form documentary projects.',
  '',
  '[{"number":"12","label":"Years shooting"},{"number":"340+","label":"Sessions"},{"number":"28","label":"Countries"}]',
  '[{"title":"Portrait Sessions","description":"Individual, couple, and family portraits. Studio or on-location.","price":"From $350 / session"},{"title":"Editorial & Commercial","description":"Magazine spreads, lookbooks, brand campaigns.","price":"Custom quote"},{"title":"Documentary Projects","description":"Long-form documentary work for NGOs and publications.","price":"Day rate available"}]',
  'Let''s make', 'something real.',
  'Available for bookings, collaborations, and commissions. Response within 48 hours.',
  '[{"label":"Email","value":"elena@elenav.com","href":"mailto:elena@elenav.com"},{"label":"Instagram","value":"@elenavoss","href":"https://instagram.com/elenavoss"},{"label":"Phone","value":"+49 123 456 7890","href":"tel:+491234567890"},{"label":"Location","value":"Berlin, DE · Dhaka, BD","href":"#"}]',
  'Elena Voss', 'Available for bookings'
from customers where subdomain = 'elena';
*/

-- ── 1. GALLERY DATA MIGRATION ─────────────────────────────────────────────────
-- Before: [{slot:1, src:"...", x:5.2, y:-3.1, scale:1.15, title:"Photo 1", category:"Wedding"}, ...]
-- After:  [{src:"...", x:5.2, y:-3.1, scale:1.15, title:"Photo 1", category:"Wedding"}, ...]
-- Sorts by original slot order, then drops ONLY the slot key.
-- title and category are real display data (hover overlay + lightbox) — kept.
-- Safe to re-run: items without slot key are already in correct shape.

UPDATE portfolio_content
SET gallery_images = (
  SELECT jsonb_agg(
    (item - 'slot')
    ORDER BY COALESCE((item->>'slot')::int, 9999)
  )
  FROM jsonb_array_elements(gallery_images) AS item
)
WHERE jsonb_array_length(gallery_images) > 0
  AND (gallery_images->0) ? 'slot';

-- Verify (expect src/x/y/scale/title/category, no slot key):
SELECT subdomain, gallery_images->0 AS first_item
FROM portfolio_content
WHERE jsonb_array_length(gallery_images) > 0;


-- ── 2. TEMPLATE_ID SYNC TRIGGER ───────────────────────────────────────────────
-- customers.template_id is the source of truth.
-- portfolio_content.template_id is a synced anon-readable copy.
-- This trigger propagates changes automatically so they can't drift.

CREATE OR REPLACE FUNCTION sync_template_id()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE portfolio_content
  SET    template_id = NEW.template_id
  WHERE  customer_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customers_template_id ON customers;
CREATE TRIGGER trg_customers_template_id
  AFTER INSERT OR UPDATE OF template_id ON customers
  FOR EACH ROW EXECUTE FUNCTION sync_template_id();


-- ── 3. TEST THE TRIGGER ────────────────────────────────────────────────────────
-- Step A: check current state
SELECT c.subdomain, c.template_id AS customers_tid, pc.template_id AS pc_tid
FROM customers c
JOIN portfolio_content pc ON pc.customer_id = c.id;

-- Step B: change a customer's template_id (use a real subdomain)
-- UPDATE customers SET template_id = 'bcs-banking-glass' WHERE subdomain = 'alu';

-- Step C: confirm portfolio_content updated automatically (trigger fired)
-- SELECT c.subdomain, c.template_id AS customers_tid, pc.template_id AS pc_tid
-- FROM customers c JOIN portfolio_content pc ON pc.customer_id = c.id
-- WHERE c.subdomain = 'alu';
-- Expect: both rows show 'bcs-banking-glass'

-- Step D: revert
-- UPDATE customers SET template_id = 'photographer-red' WHERE subdomain = 'alu';

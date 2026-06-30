-- Add template_id to portfolio_content so the live page can read it
-- without touching the customers table (which is RLS-blocked for anon).
--
-- Run this once in the Supabase SQL Editor.

ALTER TABLE portfolio_content
  ADD COLUMN IF NOT EXISTS template_id TEXT REFERENCES templates(id);

-- Backfill from customers for all existing rows
UPDATE portfolio_content pc
SET    template_id = c.template_id
FROM   customers c
WHERE  pc.customer_id = c.id
  AND  pc.template_id IS NULL;

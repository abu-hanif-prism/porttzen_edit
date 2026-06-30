// Shared field-resolution layer.
// No UI imports — safe to call from the editor, a live renderer, or a validator.
import type { PortfolioContent } from './types';

// ── Schema types ──────────────────────────────────────────────────────────────

export type PrimitiveType = 'text' | 'textarea' | 'image' | 'link';
export type FieldType = PrimitiveType | 'repeater';

/** Sub-field inside repeater.items — never has a source of its own. */
export interface ItemFieldDef {
  key: string;
  type: PrimitiveType;
  label: string;
}

export interface ScalarFieldDef {
  key: string;
  type: PrimitiveType;
  label: string;
  source: 'flat' | 'extra';
  slot?: string;        // upload slot name for image fields (e.g. "about" for about_image)
}

export interface RepeaterFieldDef {
  key: string;
  type: 'repeater';
  label: string;
  source: 'flat' | 'extra';
  max?: number;
  slotPrefix?: string;  // upload slot prefix (e.g. "gallery" → slot "gallery_1")
  items: ItemFieldDef[];
}

export type FieldDef = ScalarFieldDef | RepeaterFieldDef;

export interface SectionDef {
  id: string;
  label: string;
  fields: FieldDef[];
}

export interface TemplateSchema {
  sections: SectionDef[];
}

// ── Type guard ────────────────────────────────────────────────────────────────

export function isRepeater(f: FieldDef): f is RepeaterFieldDef {
  return f.type === 'repeater';
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Read a top-level field value from portfolio_content.
 *   source:"flat"  → content[key]  (named column)
 *   source:"extra" → content.extra_fields[key]  (JSONB bag)
 */
export function resolveField(content: PortfolioContent, field: FieldDef): unknown {
  if (field.source === 'flat') {
    return (content as unknown as Record<string, unknown>)[field.key] ?? null;
  }
  return (content.extra_fields ?? {})[field.key] ?? null;
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Return a new portfolio_content with one top-level field updated.
 * Never mutates the original.
 */
export function setField(
  content: PortfolioContent,
  field: FieldDef,
  value: unknown,
): PortfolioContent {
  if (field.source === 'flat') {
    return { ...content, [field.key]: value };
  }
  return {
    ...content,
    extra_fields: { ...(content.extra_fields ?? {}), [field.key]: value },
  };
}

/**
 * Return a new portfolio_content with one sub-key inside a repeater item updated.
 * Preserves every other key on the item — including x/y/scale/slot on gallery_images.
 */
export function setRepeaterItem(
  content: PortfolioContent,
  field: RepeaterFieldDef,
  index: number,
  subKey: string,
  value: unknown,
): PortfolioContent {
  const arr = (resolveField(content, field) as Record<string, unknown>[]) ?? [];
  const next = arr.map((item, i) =>
    i === index ? { ...item, [subKey]: value } : item,
  );
  return setField(content, field, next);
}

/**
 * Build the Supabase .update() payload from only the fields declared in the
 * schema.  Only changed fields are included (diff against original).
 * All extra_fields changes are merged into a single extra_fields column write.
 */
export function buildUpdatePayload(
  original: PortfolioContent,
  current: PortfolioContent,
  schema: TemplateSchema,
): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  const extra: Record<string, unknown> = {};
  let extraChanged = false;

  for (const section of schema.sections) {
    for (const field of section.fields) {
      const prev = resolveField(original, field);
      const next = resolveField(current, field);
      if (JSON.stringify(prev) === JSON.stringify(next)) continue;

      if (field.source === 'flat') {
        flat[field.key] = next;
      } else {
        extra[field.key] = next;
        extraChanged = true;
      }
    }
  }

  if (extraChanged) {
    // Write the full merged extra_fields object so nothing is lost
    flat.extra_fields = { ...(original.extra_fields ?? {}), ...extra };
  }

  return flat;
}

// ── Repeater helpers ──────────────────────────────────────────────────────────

export function repeaterAppend(
  content: PortfolioContent,
  field: RepeaterFieldDef,
): PortfolioContent {
  const arr = (resolveField(content, field) as Record<string, unknown>[]) ?? [];
  const blank = Object.fromEntries(field.items.map(f => [f.key, '']));
  return setField(content, field, [...arr, blank]);
}

export function repeaterRemove(
  content: PortfolioContent,
  field: RepeaterFieldDef,
  index: number,
): PortfolioContent {
  const arr = (resolveField(content, field) as Record<string, unknown>[]) ?? [];
  return setField(content, field, arr.filter((_, i) => i !== index));
}

export function repeaterMove(
  content: PortfolioContent,
  field: RepeaterFieldDef,
  from: number,
  to: number,
): PortfolioContent {
  const arr = [...((resolveField(content, field) as Record<string, unknown>[]) ?? [])];
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  return setField(content, field, arr);
}

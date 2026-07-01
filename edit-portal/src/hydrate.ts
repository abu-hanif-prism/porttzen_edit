// Ported from www/index.html's generic hydration engine. Keep behavior in
// sync with that file — it's a separate static-HTML runtime, not a shared
// module, since the live shell has no build step to import this from.
import { resolveField } from './schema';
import type { FieldDef, TemplateSchema } from './schema';
import type { PortfolioContent } from './types';

export function imgUrl(subdomain: string, src: string): string {
  if (!src) return '';
  if (src.startsWith('http')) return src;
  return import.meta.env.DEV
    ? `http://localhost:3000/${src}`
    : `https://${subdomain}.md-hanif.xyz/${src}`;
}

function buildFieldMap(schema: TemplateSchema): Record<string, FieldDef> {
  const map: Record<string, FieldDef> = {};
  for (const sec of schema.sections) for (const f of sec.fields) map[f.key] = f;
  return map;
}

function applyCrop(img: HTMLImageElement, val: unknown) {
  if (val && typeof val === 'object' && 'x' in (val as Record<string, unknown>)) {
    const v = val as { x?: number; y?: number; scale?: number };
    img.style.transform = `translate(${v.x ?? 0}%, ${v.y ?? 0}%) scale(${v.scale ?? 1})`;
    img.style.transformOrigin = 'center center';
    img.dataset.pzX = String(v.x ?? 0);
    img.dataset.pzY = String(v.y ?? 0);
    img.dataset.pzScale = String(v.scale ?? 1);
  }
}

function applyScalarField(el: HTMLElement, field: FieldDef, val: unknown, subdomain: string) {
  if (field.type === 'image') {
    const src = typeof val === 'string' ? val : ((val as { src?: string })?.src ?? '');
    if (!src) return;
    if (el.tagName === 'IMG') {
      const img = el as HTMLImageElement;
      img.src = imgUrl(subdomain, src);
      applyCrop(img, val);
    } else {
      const img = el.querySelector('img');
      if (img) { img.src = imgUrl(subdomain, src); applyCrop(img, val); }
    }
  } else if (field.type === 'link') {
    if (el.tagName === 'A') (el as HTMLAnchorElement).href = String(val ?? '#');
    else el.textContent = String(val ?? '');
  } else {
    el.textContent = String(val ?? '');
  }
}

function applySubfield(el: HTMLElement, subKey: string, item: Record<string, unknown>, subdomain: string) {
  const val = item[subKey];
  if (val === undefined || val === null || val === '') return;
  if (el.tagName === 'IMG') {
    const src = typeof val === 'string' ? val : ((val as { src?: string })?.src ?? '');
    if (src) { (el as HTMLImageElement).src = imgUrl(subdomain, src); applyCrop(el as HTMLImageElement, item); }
  } else if (el.tagName === 'A') {
    (el as HTMLAnchorElement).href = String(val ?? '#');
  } else {
    el.textContent = String(val);
  }
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function hydrateRepeater(
  container: HTMLElement, tmpl: HTMLElement, items: Record<string, unknown>[], subdomain: string,
) {
  container.innerHTML = '';
  items.forEach((item, idx) => {
    const el = tmpl.cloneNode(true) as HTMLElement;
    el.removeAttribute('data-repeater-item');
    el.querySelectorAll('[data-repeater-index]').forEach((n) => {
      n.textContent = ROMAN[idx] || String(idx + 1);
    });
    if (el.hasAttribute('data-subfield')) {
      applySubfield(el, el.dataset.subfield!, item, subdomain);
    }
    el.querySelectorAll<HTMLElement>('[data-subfield]').forEach((sub) => {
      applySubfield(sub, sub.dataset.subfield!, item, subdomain);
    });
    container.appendChild(el);
  });
}

/** Hydrate a fetched template DOM (iframe body) with the customer's content. */
export function hydrateTemplate(host: HTMLElement, content: PortfolioContent, schema: TemplateSchema, subdomain: string) {
  const fields = buildFieldMap(schema);

  host.querySelectorAll<HTMLElement>('[data-field]').forEach((el) => {
    const field = fields[el.dataset.field!];
    if (!field) return;
    const val = resolveField(content, field);
    if (val === null || val === undefined || val === '') return;
    applyScalarField(el, field, val, subdomain);
  });

  host.querySelectorAll<HTMLElement>('[data-repeater]').forEach((container) => {
    const field = fields[container.dataset.repeater!];
    if (!field || field.type !== 'repeater') return;
    const items = (resolveField(content, field) as Record<string, unknown>[]) ?? [];
    const tmpl = container.querySelector<HTMLElement>('[data-repeater-item]');
    if (!tmpl) return;
    // Keep an inert copy of the template node for later clone-to-add operations,
    // since hydrateRepeater clears the container's real children.
    if (!container.dataset.pzTmplStashed) {
      const stash = document.createElement('template');
      stash.setAttribute('data-pz-stash-for', container.dataset.repeater!);
      stash.content.appendChild(tmpl.cloneNode(true));
      stash.style.display = 'none';
      container.parentElement?.insertBefore(stash, container.nextSibling);
      container.dataset.pzTmplStashed = '1';
    }
    hydrateRepeater(container, tmpl, items, subdomain);
  });
}

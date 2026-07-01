import { useEffect, useMemo, useRef, useState } from 'react';
import { hydrateTemplate, imgUrl } from './hydrate';
import type { TemplateSchema, FieldDef, RepeaterFieldDef, ScalarFieldDef } from './schema';
import type { PortfolioContent } from './types';
import CropModal from './CropModal';

const API = import.meta.env.VITE_UPLOAD_API_URL as string;

interface Props {
  schema: TemplateSchema;
  content: PortfolioContent;
  templateId: string;
  subdomain: string;
  token: string;
  disabled?: boolean;
  onFieldChange: (field: FieldDef, value: unknown) => void;
  onRepeaterChange: (field: RepeaterFieldDef, i: number, subKey: string, value: unknown) => void;
  onPatchRepeaterItem: (field: RepeaterFieldDef, i: number, patch: Record<string, unknown>) => void;
  onRepeaterAdd: (field: RepeaterFieldDef) => void;
  onRepeaterRemove: (field: RepeaterFieldDef, i: number) => void;
  onUnavailable: () => void;
}

interface CropState {
  field: RepeaterFieldDef;
  idx: number;
  src: string;
  initTx: number;
  initTy: number;
  initScale: number;
  applyTo: HTMLImageElement;
}

const WYSIWYG_CSS = `
.pz-wys-hover{outline:2px dashed #659287!important;outline-offset:2px;cursor:text;}
.pz-wys-input{outline:2px solid #659287!important;background:rgba(101,146,135,.08)!important;box-sizing:border-box;}
.pz-wys-img-wrap{position:relative!important;}
.pz-wys-img-overlay{position:absolute;inset:0;background:rgba(10,20,15,.55);display:flex;align-items:center;justify-content:center;gap:.4rem;flex-wrap:wrap;opacity:0;transition:opacity .15s;z-index:9000;pointer-events:none;}
.pz-wys-img-wrap:hover .pz-wys-img-overlay{opacity:1;pointer-events:auto;}
.pz-wys-btn{font-family:system-ui,sans-serif;font-size:11px;font-weight:600;padding:.35rem .7rem;border-radius:6px;border:1px solid rgba(255,255,255,.4);background:rgba(0,0,0,.4);color:#fff;cursor:pointer;}
.pz-wys-btn:hover{background:#659287;border-color:#659287;}
.pz-wys-del-btn{position:absolute;top:.4rem;right:.4rem;width:24px;height:24px;border-radius:50%;background:rgba(211,47,47,.9);color:#fff;border:none;cursor:pointer;font-size:13px;line-height:1;z-index:9100;display:flex;align-items:center;justify-content:center;}
.pz-wys-add-btn{display:block;width:100%;margin:.75rem 0;padding:.85rem;border:2px dashed rgba(101,146,135,.55);background:rgba(101,146,135,.08);color:#3a5a47;font-family:system-ui,sans-serif;font-weight:600;font-size:.8rem;border-radius:10px;cursor:pointer;}
.pz-wys-add-btn:hover{background:rgba(101,146,135,.18);}
.pz-wys-busy{position:absolute;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:9200;color:#fff;font-family:system-ui,sans-serif;font-size:11px;}
`;

export default function WysiwygEditor({
  schema, content, templateId, subdomain, token, disabled,
  onFieldChange, onRepeaterChange, onPatchRepeaterItem, onRepeaterAdd, onRepeaterRemove, onUnavailable,
}: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const disabledRef = useRef(disabled);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);

  const fieldMap = useMemo(() => {
    const m: Record<string, FieldDef> = {};
    for (const sec of schema.sections) for (const f of sec.fields) m[f.key] = f;
    return m;
  }, [schema]);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    fetch(`/templates/${templateId}.html`)
      .then((res) => { if (!res.ok) throw new Error('edit.html not found'); return res.text(); })
      .then((raw) => {
        if (cancelled) return;
        const withCss = raw.includes('</head>')
          ? raw.replace('</head>', `<style>${WYSIWYG_CSS}</style></head>`)
          : `<style>${WYSIWYG_CSS}</style>${raw}`;
        setHtml(withCss);
      })
      .catch(() => { if (!cancelled) onUnavailable(); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  function handleLoad() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    hydrateTemplate(doc.body, content, schema, subdomain);
    wireScalarFields(doc);
    wireRepeaters(doc);
  }

  // ── Scalar fields ─────────────────────────────────────────────────────────────

  function wireScalarFields(doc: Document) {
    doc.querySelectorAll<HTMLElement>('[data-field]').forEach((el) => {
      const field = fieldMap[el.dataset.field!];
      if (!field) return;
      if (field.type === 'image') { wireScalarImage(doc, el, field); return; }
      if (field.type === 'link' && el.tagName === 'A') {
        wireLinkHref(el as HTMLAnchorElement, (v) => onFieldChange(field, v));
        return;
      }
      wireTextElement(doc, el, { multiline: field.type === 'textarea', commit: (v) => onFieldChange(field, v) });
    });
  }

  function wireScalarImage(doc: Document, el: HTMLElement, field: ScalarFieldDef) {
    const img = el.tagName === 'IMG' ? (el as HTMLImageElement) : el.querySelector('img');
    const wrapTarget = img ?? el;
    const parent = wrapTarget.parentElement ?? el;
    parent.classList.add('pz-wys-img-wrap');
    const slot = field.slot ?? field.key;

    const overlay = buildImageOverlay(doc, {
      getSrc: () => img?.getAttribute('src') ?? '',
      onUpload: async (file) => {
        const fd = new FormData();
        fd.append('subdomain', subdomain); fd.append('token', token); fd.append('slot', slot); fd.append('file', file);
        const res = await fetch(`${API}/upload`, { method: 'POST', body: fd });
        const body = await res.json();
        if (!res.ok) { alert('Upload failed: ' + body.error); throw new Error(body.error); }
        if (img) img.src = imgUrl(subdomain, body.path);
        onFieldChange(field, body.path);
      },
      onRemove: async () => {
        const res = await fetch(`${API}/upload`, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subdomain, token, slot }),
        });
        if (!res.ok) { const b = await res.json(); alert('Remove failed: ' + b.error); throw new Error(b.error); }
        if (img) img.removeAttribute('src');
        onFieldChange(field, '');
      },
    });
    parent.appendChild(overlay);
  }

  function wireLinkHref(el: HTMLAnchorElement, commit: (v: string) => void) {
    const doc = el.ownerDocument;
    el.addEventListener('mouseenter', () => { if (!disabledRef.current) el.classList.add('pz-wys-hover'); });
    el.addEventListener('mouseleave', () => el.classList.remove('pz-wys-hover'));
    el.addEventListener('click', (e) => {
      if (disabledRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const current = el.getAttribute('href') ?? '';
      const next = doc.defaultView?.prompt('Link URL', current);
      if (next === null || next === undefined) return;
      el.setAttribute('href', next);
      commit(next);
    });
  }

  function wireTextElement(doc: Document, el: HTMLElement, opts: { multiline: boolean; commit: (v: string) => void }) {
    el.addEventListener('mouseenter', () => { if (!disabledRef.current) el.classList.add('pz-wys-hover'); });
    el.addEventListener('mouseleave', () => el.classList.remove('pz-wys-hover'));
    el.addEventListener('click', (e) => {
      if (disabledRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      startEdit();
    });

    function startEdit() {
      if (el.style.display === 'none') return; // already editing
      const current = el.textContent ?? '';
      const input = doc.createElement(opts.multiline ? 'textarea' : 'input') as HTMLInputElement | HTMLTextAreaElement;
      input.className = 'pz-wys-input';
      input.value = current;
      const cs = doc.defaultView!.getComputedStyle(el);
      Object.assign(input.style, {
        font: cs.font, color: cs.color, textAlign: cs.textAlign, letterSpacing: cs.letterSpacing,
        lineHeight: cs.lineHeight, width: '100%', display: 'block', padding: '0', margin: '0',
      });
      if (opts.multiline) input.style.minHeight = cs.height;
      el.classList.remove('pz-wys-hover');
      el.style.display = 'none';
      el.insertAdjacentElement('beforebegin', input);
      input.focus();
      if (input instanceof HTMLInputElement) input.select();

      const commit = () => {
        input.removeEventListener('blur', commit);
        const val = input.value;
        input.remove();
        el.style.display = '';
        el.textContent = val;
        opts.commit(val);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ke: Event) => {
        const key = (ke as KeyboardEvent).key;
        if (key === 'Enter' && !opts.multiline) { ke.preventDefault(); input.blur(); }
        if (key === 'Escape') { input.value = current; input.blur(); }
      });
    }
  }

  // ── Repeaters ─────────────────────────────────────────────────────────────────

  function wireRepeaters(doc: Document) {
    doc.querySelectorAll<HTMLElement>('[data-repeater]').forEach((container) => {
      const field = fieldMap[container.dataset.repeater!];
      if (!field || field.type !== 'repeater') return;
      const rField = field as RepeaterFieldDef;

      const addBtnRef: { current: HTMLButtonElement | null } = { current: null };
      const updateAddBtn = () => {
        if (!addBtnRef.current) return;
        const count = container.children.length;
        addBtnRef.current.style.display = rField.max && count >= rField.max ? 'none' : '';
      };

      Array.from(container.children).forEach((itemEl) =>
        wireRepeaterItem(doc, itemEl as HTMLElement, rField, updateAddBtn));

      if (!disabledRef.current) {
        const stash = doc.querySelector<HTMLTemplateElement>(`template[data-pz-stash-for="${rField.key}"]`);
        if (stash) {
          const btn = doc.createElement('button');
          btn.type = 'button';
          btn.className = 'pz-wys-add-btn';
          btn.textContent = `+ Add ${rField.label}`;
          btn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            const clone = (stash.content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
            clone.removeAttribute('data-repeater-item');
            clearPlaceholderText(clone);
            container.appendChild(clone);
            wireRepeaterItem(doc, clone, rField, updateAddBtn);
            onRepeaterAdd(rField);
            updateAddBtn();
          };
          container.after(btn);
          addBtnRef.current = btn;
          updateAddBtn();
        }
      }
    });
  }

  function wireRepeaterItem(doc: Document, itemEl: HTMLElement, field: RepeaterFieldDef, onRemoved: () => void) {
    const getIndex = () => Array.from(itemEl.parentElement!.children).indexOf(itemEl);

    if (itemEl.hasAttribute('data-subfield')) {
      wireSubfieldElement(doc, itemEl, field, getIndex, itemEl.dataset.subfield!);
    }
    itemEl.querySelectorAll<HTMLElement>('[data-subfield]').forEach((sub) => {
      wireSubfieldElement(doc, sub, field, getIndex, sub.dataset.subfield!);
    });

    if (!disabledRef.current && !field.max) {
      const cs = doc.defaultView!.getComputedStyle(itemEl);
      if (cs.position === 'static') itemEl.style.position = 'relative';
      const del = doc.createElement('button');
      del.type = 'button';
      del.className = 'pz-wys-del-btn';
      del.textContent = '✕';
      del.title = 'Remove item';
      del.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const i = getIndex();
        itemEl.remove();
        onRepeaterRemove(field, i);
        onRemoved();
      };
      itemEl.appendChild(del);
    }
  }

  function wireSubfieldElement(
    doc: Document, el: HTMLElement, field: RepeaterFieldDef, getIndex: () => number, subKey: string,
  ) {
    const subDef = field.items.find((i) => i.key === subKey);
    if (!subDef) return;

    if (subDef.type === 'image') { wireRepeaterImage(doc, el, field, getIndex, subKey); return; }
    if (subDef.type === 'link' && el.tagName === 'A') {
      wireLinkHref(el as HTMLAnchorElement, (v) => onRepeaterChange(field, getIndex(), subKey, v));
      return;
    }
    wireTextElement(doc, el, {
      multiline: subDef.type === 'textarea',
      commit: (v) => onRepeaterChange(field, getIndex(), subKey, v),
    });
  }

  function wireRepeaterImage(
    doc: Document, el: HTMLElement, field: RepeaterFieldDef, getIndex: () => number, subKey: string,
  ) {
    const img = el.tagName === 'IMG' ? (el as HTMLImageElement) : el.querySelector('img');
    const wrapTarget = img ?? el;
    const parent = wrapTarget.parentElement ?? el;
    parent.classList.add('pz-wys-img-wrap');

    const overlay = buildImageOverlay(doc, {
      getSrc: () => img?.getAttribute('src') ?? '',
      onUpload: async (file) => {
        const i = getIndex();
        const slot = `${field.slotPrefix ?? field.key}_${i + 1}`;
        const fd = new FormData();
        fd.append('subdomain', subdomain); fd.append('token', token); fd.append('slot', slot); fd.append('file', file);
        const res = await fetch(`${API}/upload`, { method: 'POST', body: fd });
        const body = await res.json();
        if (!res.ok) { alert('Upload failed: ' + body.error); throw new Error(body.error); }
        if (img) img.src = imgUrl(subdomain, body.path);
        onRepeaterChange(field, i, subKey, body.path);
      },
      onRemove: async () => {
        const i = getIndex();
        const slot = `${field.slotPrefix ?? field.key}_${i + 1}`;
        const res = await fetch(`${API}/upload`, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subdomain, token, slot }),
        });
        if (!res.ok) { const b = await res.json(); alert('Remove failed: ' + b.error); throw new Error(b.error); }
        if (img) img.removeAttribute('src');
        onRepeaterChange(field, i, subKey, '');
      },
      onCrop: img ? () => {
        const i = getIndex();
        const src = img.getAttribute('src') ?? '';
        if (!src) return;
        setCrop({
          field, idx: i, src,
          initTx: parseFloat(img.dataset.pzX ?? '0'),
          initTy: parseFloat(img.dataset.pzY ?? '0'),
          initScale: parseFloat(img.dataset.pzScale ?? '1'),
          applyTo: img,
        });
      } : undefined,
    });
    parent.appendChild(overlay);
  }

  // ── Shared: image overlay builder ────────────────────────────────────────────

  function buildImageOverlay(doc: Document, opts: {
    getSrc: () => string;
    onUpload: (file: File) => Promise<void>;
    onRemove: () => Promise<void>;
    onCrop?: () => void;
  }) {
    const overlay = doc.createElement('div');
    overlay.className = 'pz-wys-img-overlay';

    const busy = doc.createElement('div');
    busy.className = 'pz-wys-busy';
    busy.textContent = '…';

    const fileInput = doc.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.jpg,.jpeg,.png,.webp';
    fileInput.style.display = 'none';

    const uploadBtn = doc.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'pz-wys-btn';
    const refresh = () => {
      uploadBtn.textContent = opts.getSrc() ? '↑ Replace' : '↑ Upload';
      removeBtn.style.display = opts.getSrc() ? '' : 'none';
    };
    uploadBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); fileInput.click(); };

    const removeBtn = doc.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'pz-wys-btn';
    removeBtn.textContent = '✕ Remove';
    removeBtn.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (disabledRef.current) return;
      busy.style.display = 'flex';
      try { await opts.onRemove(); refresh(); } finally { busy.style.display = 'none'; }
    };

    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file || disabledRef.current) return;
      busy.style.display = 'flex';
      try { await opts.onUpload(file); refresh(); } finally { busy.style.display = 'none'; }
    };

    overlay.append(uploadBtn, removeBtn, fileInput, busy);

    if (opts.onCrop) {
      const cropBtn = doc.createElement('button');
      cropBtn.type = 'button';
      cropBtn.className = 'pz-wys-btn';
      cropBtn.textContent = '⤢ Crop';
      cropBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (!disabledRef.current) opts.onCrop!(); };
      overlay.insertBefore(cropBtn, busy);
    }

    refresh();
    return overlay;
  }

  function clearPlaceholderText(root: HTMLElement) {
    if (root.hasAttribute('data-subfield')) clearOne(root);
    root.querySelectorAll<HTMLElement>('[data-subfield]').forEach(clearOne);
    function clearOne(el: HTMLElement) {
      if (el.tagName === 'IMG') { el.removeAttribute('src'); return; }
      if (el.tagName === 'A') { el.setAttribute('href', '#'); return; }
      el.textContent = '';
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (html === null) {
    return (
      <div className="pz-center" style={{ minHeight: '50vh' }}>
        <div className="pz-spinner" />
      </div>
    );
  }

  return (
    <div className="pz-wys-wrap">
      {crop && (
        <CropModal
          src={imgUrl(subdomain, crop.src)}
          initTx={crop.initTx}
          initTy={crop.initTy}
          initScale={crop.initScale}
          onDone={(tx, ty, scale) => {
            crop.applyTo.style.transform = `translate(${tx}%, ${ty}%) scale(${scale})`;
            crop.applyTo.style.transformOrigin = 'center center';
            crop.applyTo.dataset.pzX = String(tx);
            crop.applyTo.dataset.pzY = String(ty);
            crop.applyTo.dataset.pzScale = String(scale);
            onPatchRepeaterItem(crop.field, crop.idx, { x: tx, y: ty, scale });
            setCrop(null);
          }}
          onCancel={() => setCrop(null)}
        />
      )}
      <iframe
        ref={iframeRef}
        srcDoc={html}
        onLoad={handleLoad}
        title="Portfolio editor preview"
        style={{ width: '100%', minHeight: '100vh', border: 'none', display: 'block' }}
      />
    </div>
  );
}

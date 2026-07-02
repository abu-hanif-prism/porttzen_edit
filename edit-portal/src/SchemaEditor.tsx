import { useState, useRef } from 'react';
import { resolveField, isRepeater } from './schema';
import type { TemplateSchema, FieldDef, RepeaterFieldDef, ScalarFieldDef } from './schema';
import type { PortfolioContent } from './types';
import CropModal from './CropModal';

const API = import.meta.env.VITE_UPLOAD_API_URL as string;

function imgUrl(subdomain: string, src: string) {
  if (!src) return '';
  if (src.startsWith('http')) return src;
  return import.meta.env.DEV
    ? `http://localhost:3000/${src}`
    : `https://${subdomain}.portzenx.com/${src}`;
}

const EDITABLE_TYPES = new Set(['text', 'textarea', 'link']);

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', fontFamily: 'inherit', fontSize: '.82rem',
  background: 'var(--bg4)', color: 'var(--text)',
  border: '1px solid var(--red)', borderRadius: 3,
  padding: '.3rem .5rem', boxSizing: 'border-box',
};

const INPUT_SMALL: React.CSSProperties = {
  ...INPUT_STYLE, fontSize: '.75rem', padding: '.2rem .4rem',
};

const BTN_SM: React.CSSProperties = {
  fontFamily: 'var(--font-b)', fontSize: '.55rem', letterSpacing: '.06em',
  background: 'var(--bg4)', color: 'var(--text3)',
  border: '1px solid var(--red-border)', borderRadius: 3,
  padding: '.2rem .4rem', cursor: 'pointer', lineHeight: 1,
};

interface CropState {
  field:     RepeaterFieldDef;
  idx:       number;
  src:       string;
  initTx:    number;
  initTy:    number;
  initScale: number;
}

interface Props {
  schema:    TemplateSchema;
  content:   PortfolioContent;
  subdomain: string;
  token:     string;
  disabled?: boolean;
  onFieldChange:       (field: FieldDef, value: unknown) => void;
  onRepeaterChange:    (field: RepeaterFieldDef, i: number, subKey: string, value: unknown) => void;
  onPatchRepeaterItem: (field: RepeaterFieldDef, i: number, patch: Record<string, unknown>) => void;
  onRepeaterAdd:       (field: RepeaterFieldDef) => void;
  onRepeaterRemove:    (field: RepeaterFieldDef, i: number) => void;
}

export default function SchemaEditor({
  schema, content, subdomain, token, disabled,
  onFieldChange, onRepeaterChange, onPatchRepeaterItem,
  onRepeaterAdd, onRepeaterRemove,
}: Props) {
  const [editKey,   setEditKey]   = useState<string | null>(null);
  const [editVal,   setEditVal]   = useState('');
  const [crop,      setCrop]      = useState<CropState | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function startEdit(key: string, current: string) {
    if (disabled) return;
    setEditKey(key);
    setEditVal(current);
  }

  function commitScalar(field: FieldDef, key: string) {
    onFieldChange(field, editVal);
    if (editKey === key) setEditKey(null);
  }

  function commitRepeater(field: RepeaterFieldDef, i: number, subKey: string, key: string) {
    onRepeaterChange(field, i, subKey, editVal);
    if (editKey === key) setEditKey(null);
  }

  // ── Slot name helpers ───────────────────────────────────────────────────────

  function repeaterSlot(field: RepeaterFieldDef, item: Record<string, unknown>, i: number): string {
    const prefix = field.slotPrefix ?? field.key;
    const num    = (item.slot as number | undefined) ?? (i + 1);
    return `${prefix}_${num}`;
  }

  function scalarSlot(field: ScalarFieldDef): string {
    return field.slot ?? field.key;
  }

  // ── Upload helpers ──────────────────────────────────────────────────────────

  async function uploadRepeaterImg(
    field: RepeaterFieldDef, i: number, subKey: string,
    file: File, slot: string, fileEl: HTMLInputElement,
  ) {
    const busyKey = `${field.key}.${i}`;
    setUploading(busyKey);
    try {
      const fd = new FormData();
      fd.append('subdomain', subdomain);
      fd.append('token', token);
      fd.append('slot', slot);
      fd.append('file', file);
      const res  = await fetch(`${API}/upload`, { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      onRepeaterChange(field, i, subKey, body.path);
    } catch (err) {
      alert('Upload failed: ' + (err instanceof Error ? err.message : err));
    } finally {
      setUploading(null);
      fileEl.value = '';
    }
  }

  async function clearRepeaterImg(
    field: RepeaterFieldDef, i: number, subKey: string,
    slot: string, src: string,
  ) {
    const busyKey = `${field.key}.${i}`;
    setUploading(busyKey);
    try {
      if (src) {
        const res = await fetch(`${API}/upload`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subdomain, token, slot }),
        });
        if (!res.ok) { const b = await res.json(); throw new Error(b.error); }
      }
      onRepeaterChange(field, i, subKey, '');
    } catch (err) {
      alert('Remove failed: ' + (err instanceof Error ? err.message : err));
    } finally {
      setUploading(null);
    }
  }

  async function uploadScalarImg(
    field: ScalarFieldDef, file: File, slot: string, fileEl: HTMLInputElement,
  ) {
    setUploading(field.key);
    try {
      const fd = new FormData();
      fd.append('subdomain', subdomain);
      fd.append('token', token);
      fd.append('slot', slot);
      fd.append('file', file);
      const res  = await fetch(`${API}/upload`, { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      onFieldChange(field, body.path);
    } catch (err) {
      alert('Upload failed: ' + (err instanceof Error ? err.message : err));
    } finally {
      setUploading(null);
      fileEl.value = '';
    }
  }

  async function clearScalarImg(field: ScalarFieldDef, slot: string, src: string) {
    setUploading(field.key);
    try {
      if (src) {
        const res = await fetch(`${API}/upload`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subdomain, token, slot }),
        });
        if (!res.ok) { const b = await res.json(); throw new Error(b.error); }
      }
      onFieldChange(field, '');
    } catch (err) {
      alert('Remove failed: ' + (err instanceof Error ? err.message : err));
    } finally {
      setUploading(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="pz-editor" style={{ fontFamily: 'var(--font-b)', color: 'var(--text)' }}>
      {crop && (
        <CropModal
          src={imgUrl(subdomain, crop.src)}
          initTx={crop.initTx}
          initTy={crop.initTy}
          initScale={crop.initScale}
          onDone={(tx, ty, scale) => {
            onPatchRepeaterItem(crop.field, crop.idx, { x: tx, y: ty, scale });
            setCrop(null);
          }}
          onCancel={() => setCrop(null)}
        />
      )}

      {schema.sections.map(section => (
        <div key={section.id} style={{ marginBottom: '2.5rem' }}>
          <div style={{
            fontSize: '.62rem', letterSpacing: '.14em', textTransform: 'uppercase',
            color: 'var(--red)', marginBottom: '.75rem', paddingBottom: '.4rem',
            borderBottom: '1px solid var(--red-border)',
          }}>
            {section.label}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
            {section.fields.map(field => {
              const value = resolveField(content, field);

              /* ── Repeater ─────────────────────────────────────────────── */
              if (isRepeater(field)) {
                const items       = (value as Record<string, unknown>[]) ?? [];
                const canAdd      = !disabled && (!field.max || items.length < field.max);
                const canDelItems = !disabled && !field.max;

                return (
                  <div key={field.key} style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '.62rem', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: '.5rem' }}>
                      {field.label} — {items.length}{field.max ? ` / ${field.max}` : ''}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem' }}>
                      {items.map((item, i) => (
                        <div key={i} style={{ background: 'var(--bg3)', borderRadius: 6, padding: '.7rem .85rem .85rem', minWidth: 170, maxWidth: 280, position: 'relative' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
                            <div style={{ fontSize: '.55rem', color: 'var(--text4)', letterSpacing: '.08em' }}>#{i + 1}</div>
                            {canDelItems && (
                              <button
                                onClick={() => onRepeaterRemove(field, i)}
                                style={{ ...BTN_SM, color: 'var(--red)', border: 'none', padding: '.1rem .3rem' }}
                                title="Remove item"
                              >✕</button>
                            )}
                          </div>

                          {field.items.map(sub => {
                            const subVal  = item[sub.key] as string | undefined;
                            const ek      = `${section.id}.${field.key}.${i}.${sub.key}`;
                            const isActive = editKey === ek;

                            /* Image sub-field */
                            if (sub.type === 'image') {
                              const src     = subVal ?? '';
                              const x       = (item.x     as number) ?? 0;
                              const y       = (item.y     as number) ?? 0;
                              const scale   = (item.scale as number) ?? 1;
                              const canCrop = !!src && !disabled;
                              const slot    = repeaterSlot(field, item, i);
                              const busy    = uploading === `${field.key}.${i}`;

                              return (
                                <div key={sub.key} style={{ marginBottom: '.5rem' }}>
                                  <div style={{ fontSize: '.58rem', color: 'var(--text4)', marginBottom: '.2rem' }}>
                                    {sub.label}
                                    {canCrop && <span style={{ marginLeft: '.3rem', opacity: 0.55 }}>· click to crop</span>}
                                  </div>

                                  {/* Thumbnail */}
                                  <div
                                    onClick={canCrop ? () => setCrop({ field, idx: i, src, initTx: x, initTy: y, initScale: scale }) : undefined}
                                    style={{ width: 72, height: 72, overflow: 'hidden', borderRadius: 4, background: 'var(--bg4)', position: 'relative', cursor: canCrop ? 'pointer' : 'default' }}
                                  >
                                    {src ? (
                                      <img
                                        src={imgUrl(subdomain, src)} alt="" draggable={false}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                                          transform: `translate(${x}%, ${y}%) scale(${scale})`,
                                          transformOrigin: 'center center' }}
                                      />
                                    ) : (
                                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.58rem', color: 'var(--text4)' }}>empty</div>
                                    )}
                                    {busy && (
                                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(12,8,7,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <div className="pz-spinner" />
                                      </div>
                                    )}
                                  </div>

                                  {/* Crop readout */}
                                  {src && (
                                    <div style={{ fontSize: '.5rem', color: 'var(--text4)', marginTop: '.15rem' }}>
                                      x{x.toFixed(1)} y{y.toFixed(1)} ×{scale.toFixed(2)}
                                    </div>
                                  )}

                                  {/* Upload controls */}
                                  {!disabled && (
                                    <div style={{ display: 'flex', gap: '.25rem', marginTop: '.3rem', flexWrap: 'wrap' }}>
                                      <input
                                        type="file" accept=".jpg,.jpeg,.png,.webp" hidden
                                        ref={el => { fileRefs.current[ek] = el; }}
                                        onChange={e => {
                                          const file = e.target.files?.[0];
                                          const el   = fileRefs.current[ek];
                                          if (file && el) uploadRepeaterImg(field, i, sub.key, file, slot, el);
                                        }}
                                      />
                                      <button style={BTN_SM} disabled={busy} onClick={() => fileRefs.current[ek]?.click()}>
                                        {src ? '↑ Replace' : '↑ Upload'}
                                      </button>
                                      {src && (
                                        <button
                                          style={{ ...BTN_SM, color: 'var(--red)' }}
                                          disabled={busy}
                                          onClick={() => clearRepeaterImg(field, i, sub.key, slot, src)}
                                        >✕ Remove</button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            }

                            /* Text / textarea / link sub-field */
                            const editable = EDITABLE_TYPES.has(sub.type) && !disabled;
                            return (
                              <div key={sub.key} style={{ marginBottom: '.35rem' }}>
                                <div style={{ fontSize: '.58rem', color: 'var(--text4)', marginBottom: '.15rem' }}>{sub.label}</div>
                                {isActive ? (
                                  sub.type === 'textarea' ? (
                                    <textarea
                                      autoFocus value={editVal}
                                      onChange={e => setEditVal(e.target.value)}
                                      onBlur={() => commitRepeater(field, i, sub.key, ek)}
                                      rows={3} style={{ ...INPUT_SMALL, resize: 'vertical' }}
                                    />
                                  ) : (
                                    <input
                                      autoFocus type={sub.type === 'link' ? 'url' : 'text'}
                                      value={editVal}
                                      onChange={e => setEditVal(e.target.value)}
                                      onBlur={() => commitRepeater(field, i, sub.key, ek)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter')  commitRepeater(field, i, sub.key, ek);
                                        if (e.key === 'Escape') setEditKey(null);
                                      }}
                                      style={INPUT_SMALL}
                                    />
                                  )
                                ) : (
                                  <div
                                    onClick={editable ? () => startEdit(ek, subVal ?? '') : undefined}
                                    style={{ fontSize: '.75rem', display: 'flex', alignItems: 'flex-start', gap: '.3rem', cursor: editable ? 'pointer' : 'default' }}
                                  >
                                    <span style={{ flex: 1, color: subVal ? 'var(--text)' : 'var(--text4)', fontStyle: subVal ? 'normal' : 'italic', whiteSpace: sub.type === 'textarea' ? 'pre-wrap' : 'normal', wordBreak: 'break-word' }}>
                                      {subVal || '—'}
                                    </span>
                                    {editable && <span style={{ fontSize: '.6rem', color: 'var(--text4)', opacity: 0.55, flexShrink: 0, marginTop: 1 }}>✎</span>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}

                      {items.length === 0 && (
                        <span style={{ fontSize: '.75rem', color: 'var(--text4)', fontStyle: 'italic' }}>no items</span>
                      )}
                    </div>

                    {canAdd && (
                      <button
                        onClick={() => onRepeaterAdd(field)}
                        style={{ ...BTN_SM, marginTop: '.6rem', padding: '.3rem .65rem' }}
                      >+ Add</button>
                    )}
                  </div>
                );
              }

              /* ── Scalar image ──────────────────────────────────────────── */
              if (field.type === 'image') {
                const strVal = String(value ?? '');
                const slot   = scalarSlot(field);
                const busy   = uploading === field.key;
                const ek     = `${section.id}.${field.key}`;

                return (
                  <div key={field.key}>
                    <div style={{ fontSize: '.6rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: '.25rem' }}>
                      {field.label}
                    </div>
                    <div style={{ width: 80, height: 80, overflow: 'hidden', borderRadius: 4, background: 'var(--bg4)', position: 'relative' }}>
                      {strVal ? (
                        <img src={imgUrl(subdomain, strVal)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.6rem', color: 'var(--text4)' }}>empty</div>
                      )}
                      {busy && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(12,8,7,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div className="pz-spinner" />
                        </div>
                      )}
                    </div>
                    {!disabled && (
                      <div style={{ display: 'flex', gap: '.25rem', marginTop: '.3rem', flexWrap: 'wrap' }}>
                        <input
                          type="file" accept=".jpg,.jpeg,.png,.webp" hidden
                          ref={el => { fileRefs.current[ek] = el; }}
                          onChange={e => {
                            const file = e.target.files?.[0];
                            const el   = fileRefs.current[ek];
                            if (file && el) uploadScalarImg(field, file, slot, el);
                          }}
                        />
                        <button style={BTN_SM} disabled={busy} onClick={() => fileRefs.current[ek]?.click()}>
                          {strVal ? '↑ Replace' : '↑ Upload'}
                        </button>
                        {strVal && (
                          <button
                            style={{ ...BTN_SM, color: 'var(--red)' }}
                            disabled={busy}
                            onClick={() => clearScalarImg(field, slot, strVal)}
                          >✕ Remove</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              }

              /* ── Scalar text / textarea / link ─────────────────────────── */
              const strVal  = String(value ?? '');
              const ek      = `${section.id}.${field.key}`;
              const isActive = editKey === ek;
              const editable = EDITABLE_TYPES.has(field.type) && !disabled;

              return (
                <div key={field.key}>
                  <div style={{ fontSize: '.6rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: '.25rem' }}>
                    {field.label}
                  </div>
                  {isActive ? (
                    field.type === 'textarea' ? (
                      <textarea
                        autoFocus value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => commitScalar(field, ek)}
                        rows={3} style={{ ...INPUT_STYLE, resize: 'vertical' }}
                      />
                    ) : (
                      <input
                        autoFocus type={field.type === 'link' ? 'url' : 'text'}
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => commitScalar(field, ek)}
                        onKeyDown={e => {
                          if (e.key === 'Enter')  commitScalar(field, ek);
                          if (e.key === 'Escape') setEditKey(null);
                        }}
                        style={INPUT_STYLE}
                      />
                    )
                  ) : (
                    <div
                      onClick={editable ? () => startEdit(ek, strVal) : undefined}
                      style={{ fontSize: '.82rem', display: 'flex', alignItems: 'flex-start', gap: '.3rem', cursor: editable ? 'pointer' : 'default' }}
                    >
                      <span style={{ flex: 1, color: strVal ? 'var(--text)' : 'var(--text4)', fontStyle: strVal ? 'normal' : 'italic', whiteSpace: field.type === 'textarea' ? 'pre-wrap' : 'normal', wordBreak: 'break-word' }}>
                        {strVal || '—'}
                      </span>
                      {editable && <span style={{ fontSize: '.65rem', color: 'var(--text4)', opacity: 0.55, flexShrink: 0, marginTop: 2 }}>✎</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Routes, Route, useParams } from 'react-router-dom';
import { supabase } from './supabase';
import { PortfolioContent, EditToken, defaultGalleryImages, defaultStats } from './types';
import {
  TemplateSchema, FieldDef, RepeaterFieldDef,
  setField, setRepeaterItem, buildUpdatePayload, resolveField,
  repeaterAppend, repeaterRemove,
} from './schema';
import SchemaEditor from './SchemaEditor';
import WysiwygEditor from './WysiwygEditor';

export default function App() {
  return (
    <Routes>
      <Route path="/:token" element={<EditPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

type Status = 'loading' | 'invalid' | 'ready';

function EditPage() {
  const { token } = useParams<{ token: string }>();
  const [status,   setStatus]   = useState<Status>('loading');
  const [errMsg,   setErrMsg]   = useState('');
  const [tokenRec, setTokenRec] = useState<EditToken | null>(null);
  const [schema,   setSchema]   = useState<TemplateSchema | null>(null);
  const [d,        setD]        = useState<PortfolioContent | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [toast,    setToast]    = useState('');
  const [wysiwygUnavailable, setWysiwygUnavailable] = useState(false);
  const originalRef = useRef<PortfolioContent | null>(null);

  useEffect(() => {
    if (!token) { setStatus('invalid'); setErrMsg('No token provided.'); return; }
    validate(token);
  }, [token]);

  async function validate(tok: string) {
    const { data: td, error: te } = await supabase
      .from('edit_tokens').select('*').eq('token', tok).single();

    if (te || !td) return fail('Link not found. Request a new one from portzenx.com');
    if (td.used)   return fail('This link has already been used. Request a new one from portzenx.com');
    if (new Date(td.expires_at) < new Date()) return fail('This link has expired. Request a new one from portzenx.com');

    setTokenRec(td as EditToken);

    const { data: pc, error: pe } = await supabase
      .from('portfolio_content').select('*').eq('customer_id', td.customer_id).single();

    if (pe || !pc) return fail('Portfolio not found. Contact support.');

    const c = pc as PortfolioContent;
    if (!c.gallery_images?.length) c.gallery_images = defaultGalleryImages();
    if (!c.stats?.length)          c.stats          = defaultStats();
    if (!c.services)               c.services       = [];
    if (!c.contact_links)          c.contact_links  = [];
    if (!c.hero_images)            c.hero_images    = [];

    originalRef.current = c;
    setD(c);

    if (c.template_id) {
      const { data: tmpl } = await supabase
        .from('templates').select('schema').eq('id', c.template_id).single();
      if (tmpl?.schema) setSchema(tmpl.schema as TemplateSchema);
    }

    setStatus('ready');
  }

  function fail(msg: string) {
    setErrMsg(msg);
    setStatus('invalid');
  }

  function onFieldChange(field: FieldDef, value: unknown) {
    setD(prev => prev ? setField(prev, field, value) : prev);
  }

  function onRepeaterChange(field: RepeaterFieldDef, i: number, subKey: string, value: unknown) {
    setD(prev => prev ? setRepeaterItem(prev, field, i, subKey, value) : prev);
  }

  function onPatchRepeaterItem(field: RepeaterFieldDef, i: number, patch: Record<string, unknown>) {
    setD(prev => {
      if (!prev) return prev;
      const arr  = (resolveField(prev, field) as Record<string, unknown>[]) ?? [];
      const next = arr.map((item, idx) => idx === i ? { ...item, ...patch } : item);
      return setField(prev, field, next);
    });
  }

  async function save() {
    if (!d || !schema || !tokenRec) return;
    setSaving(true);
    try {
      const payload = buildUpdatePayload(originalRef.current!, d, schema);
      if (Object.keys(payload).length === 0) {
        setToast('Nothing to save — no changes detected.');
        setTimeout(() => setToast(''), 3000);
        return;
      }
      const { error } = await supabase
        .from('portfolio_content').update(payload).eq('subdomain', tokenRec.subdomain);
      if (error) throw error;
      await supabase.from('edit_tokens').update({ used: true }).eq('id', tokenRec.id);
      setSaved(true);
      setToast(`Portfolio updated! Live at ${tokenRec.subdomain}.portzenx.com`);
      setTimeout(() => setToast(''), 5000);
    } catch (err) {
      setToast('Save failed. Please try again.');
      setTimeout(() => setToast(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading') return (
    <div className="pz-center">
      <div className="pz-spinner" />
      <span style={{ fontFamily:'var(--font-b)', fontSize:'.7rem', color:'var(--text4)', letterSpacing:'.15em', textTransform:'uppercase' }}>
        Loading editor
      </span>
    </div>
  );

  if (status === 'invalid') return (
    <div className="pz-center">
      <div style={{ fontSize:'3rem', color:'var(--bg4)' }}>✕</div>
      <p className="pz-err-title">Link Expired or Invalid</p>
      <p className="pz-err-msg">{errMsg}</p>
      <a href="https://portzenx.com" className="pz-err-link">Request a new link</a>
    </div>
  );

  if (!schema || !d) return (
    <div className="pz-center">
      <p style={{ fontFamily:'var(--font-b)', fontSize:'.85rem', color:'var(--text3)' }}>
        No template found for this portfolio. Contact support.
      </p>
    </div>
  );

  const liveUrl = import.meta.env.DEV
    ? `http://localhost:3000?sub=${tokenRec!.subdomain}`
    : `https://${tokenRec!.subdomain}.portzenx.com`;

  return (
    <div>
      <div className="pz-edit-bar">
        <div className="pz-bar-brand">Port<span>Zen</span> Editor</div>
        <div className="pz-bar-right">
          <a href={liveUrl} target="_blank" rel="noreferrer" className="pz-bar-live">View Live ↗</a>
          {!saved && (
            <button className="pz-save-btn" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save & Publish'}
            </button>
          )}
        </div>
      </div>

      {saved && (
        <div className="pz-saved-banner" style={{ marginTop: '52px' }}>
          Portfolio updated — live at{' '}
          <a href={liveUrl} target="_blank" rel="noreferrer">{tokenRec!.subdomain}.portzenx.com</a>.
          &nbsp;Edit link used. Request a new one from portzenx.com
        </div>
      )}

      {wysiwygUnavailable || !d.template_id ? (
        <SchemaEditor
          schema={schema}
          content={d}
          subdomain={tokenRec!.subdomain}
          token={token!}
          disabled={saved}
          onFieldChange={onFieldChange}
          onRepeaterChange={onRepeaterChange}
          onPatchRepeaterItem={onPatchRepeaterItem}
          onRepeaterAdd={field => setD(prev => prev ? repeaterAppend(prev, field) : prev)}
          onRepeaterRemove={(field, i) => setD(prev => prev ? repeaterRemove(prev, field, i) : prev)}
        />
      ) : (
        <WysiwygEditor
          schema={schema}
          content={d}
          templateId={d.template_id}
          subdomain={tokenRec!.subdomain}
          token={token!}
          disabled={saved}
          onFieldChange={onFieldChange}
          onRepeaterChange={onRepeaterChange}
          onPatchRepeaterItem={onPatchRepeaterItem}
          onRepeaterAdd={field => setD(prev => prev ? repeaterAppend(prev, field) : prev)}
          onRepeaterRemove={(field, i) => setD(prev => prev ? repeaterRemove(prev, field, i) : prev)}
          onUnavailable={() => setWysiwygUnavailable(true)}
        />
      )}

      {toast && <div className="pz-toast">{toast}</div>}
    </div>
  );
}

function NotFound() {
  return (
    <div className="pz-center">
      <p style={{ fontFamily:'var(--font-b)', fontSize:'.85rem', color:'var(--text3)' }}>
        Visit <strong>edit.portzenx.com/your-token</strong> to edit your portfolio.
      </p>
    </div>
  );
}

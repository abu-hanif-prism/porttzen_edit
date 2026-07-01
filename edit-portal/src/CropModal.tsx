import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  src:      string;
  initTx:   number;
  initTy:   number;
  initScale: number;
  onDone:   (tx: number, ty: number, scale: number) => void;
  onCancel: () => void;
}

export default function CropModal({ src, initTx, initTy, initScale, onDone, onCancel }: Props) {
  const [scale, setScale] = useState(initScale);
  const [tx, setTx]       = useState(initTx);
  const [ty, setTy]       = useState(initTy);
  const previewRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; otx: number; oty: number } | null>(null);
  const pinch = useRef<{ startDist: number; startScale: number } | null>(null);

  function maxT(s: number) { return 50 * (s - 1); }
  function clamp(v: number, s: number) { const m = maxT(s); return Math.max(-m, Math.min(m, v)); }

  function down(clientX: number, clientY: number) {
    drag.current = { sx: clientX, sy: clientY, otx: tx, oty: ty };
  }
  function move(clientX: number, clientY: number) {
    if (!drag.current || !previewRef.current) return;
    const r   = previewRef.current.getBoundingClientRect();
    const ntx = clamp(drag.current.otx + (clientX - drag.current.sx) / r.width  * 100, scale);
    const nty = clamp(drag.current.oty + (clientY - drag.current.sy) / r.height * 100, scale);
    setTx(ntx); setTy(nty);
  }
  function up() { drag.current = null; }

  function mouseDown(e: React.MouseEvent) { e.preventDefault(); down(e.clientX, e.clientY); }
  function mouseMove(e: React.MouseEvent) { move(e.clientX, e.clientY); }

  function touchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (t) down(t.clientX, t.clientY);
  }
  function touchMove(e: React.TouchEvent) {
    if (!drag.current) return;
    const t = e.touches[0];
    if (t) move(t.clientX, t.clientY);
  }

  function touchDistance(e: React.TouchEvent) {
    const [a, b] = [e.touches[0], e.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
  function pinchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinch.current = { startDist: touchDistance(e), startScale: scale };
      drag.current = null;
    } else {
      touchStart(e);
    }
  }
  function pinchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinch.current) {
      const ns = Math.max(1, Math.min(4, pinch.current.startScale * (touchDistance(e) / pinch.current.startDist)));
      setScale(ns);
      setTx(v => clamp(v, ns));
      setTy(v => clamp(v, ns));
    } else {
      touchMove(e);
    }
  }
  function pinchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinch.current = null;
    if (e.touches.length === 0) up();
  }

  function wheel(e: React.WheelEvent) {
    e.preventDefault();
    setScale(s => {
      const ns = Math.max(1, Math.min(4, s - e.deltaY * 0.002));
      setTx(v => clamp(v, ns));
      setTy(v => clamp(v, ns));
      return ns;
    });
  }
  function changeScale(ns: number) {
    setScale(ns);
    setTx(v => clamp(v, ns));
    setTy(v => clamp(v, ns));
  }

  return createPortal(
    <div className="pz-crop-overlay" onClick={onCancel}>
      <div className="pz-crop-box" onClick={e => e.stopPropagation()}>

        <div className="pz-crop-hdr">
          <span>Drag to reposition &nbsp;·&nbsp; Scroll or slider to zoom</span>
          <button className="pz-crop-x" onClick={onCancel}>✕</button>
        </div>

        <div
          ref={previewRef}
          className="pz-crop-preview"
          onMouseDown={mouseDown} onMouseMove={mouseMove}
          onMouseUp={up} onMouseLeave={up}
          onTouchStart={pinchStart} onTouchMove={pinchMove} onTouchEnd={pinchEnd}
          onWheel={wheel}
          style={{ cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
          <img
            src={src} draggable={false}
            style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              transform: `translate(${tx}%, ${ty}%) scale(${scale})`,
              transformOrigin: 'center center',
              userSelect: 'none', pointerEvents: 'none',
            }}
          />
          <div className="pz-crop-grid" />
        </div>

        <div className="pz-crop-ftr">
          <label className="pz-zoom-row">
            <span>Zoom</span>
            <input type="range" min={1} max={4} step={0.02}
              value={scale} onChange={e => changeScale(+e.target.value)} />
            <span className="pz-zoom-val">{Math.round(scale * 100)}%</span>
          </label>
          <button className="pz-apply-btn" onClick={() => onDone(tx, ty, scale)}>
            ✓ Apply crop
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}

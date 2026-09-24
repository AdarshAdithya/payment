import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { parseUpi } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Scan() {
  const video = useRef(null);
  const canvas = useRef(null);
  const navigate = useNavigate();
  const toast = useToast();
  const [camError, setCamError] = useState('');
  const [manual, setManual] = useState('');

  const handle = (text) => {
    const p = parseUpi(text);
    if (!p) { toast('Not a valid UPI QR code', 'error'); return false; }
    const qs = new URLSearchParams();
    if (p.am && Number(p.am) > 0) qs.set('am', String(Number(p.am)));
    if (p.tn) qs.set('tn', p.tn);
    navigate(`/pay/to/${encodeURIComponent(p.pa)}${qs.toString() ? `?${qs}` : ''}`, { replace: true });
    return true;
  };

  useEffect(() => {
    let stream; let raf; let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = () => {
          if (stopped) return;
          const v = video.current;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            const c = canvas.current;
            c.width = v.videoWidth; c.height = v.videoHeight;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(v, 0, 0);
            const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
            if (code?.data && parseUpi(code.data)) { stopped = true; handle(code.data); return; }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setCamError('Camera unavailable. Upload a QR image or enter a UPI ID below.');
      }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const c = canvas.current;
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      if (code?.data) handle(code.data); else toast('No QR code found in that image', 'error');
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  };

  return (
    <div className="scan">
      <div className="scan__top">
        <button className="icon-btn icon-btn--light" onClick={() => navigate(-1)} aria-label="Close"><Icon name="x" /></button>
        <span>Scan any UPI QR</span>
        <span style={{ width: 40 }} />
      </div>
      <div className="scan__view">
        <video ref={video} playsInline muted />
        <div className="scan__frame"><span /></div>
        {camError && <p className="scan__error">{camError}</p>}
      </div>
      <canvas ref={canvas} hidden />
      <div className="scan__bottom">
        <label className="btn btn--ghost btn--on-dark"><Icon name="image" size={18} /> Upload from gallery<input type="file" accept="image/*" hidden onChange={upload} /></label>
        <form className="search-box" onSubmit={(e) => { e.preventDefault(); handle(manual); }}>
          <Icon name="at" size={18} />
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or enter UPI ID / number" />
          <button className="btn btn--sm btn--primary" disabled={!manual}>Go</button>
        </form>
        <button className="link link--light" onClick={() => navigate('/qr')}>Show my QR code</button>
      </div>
    </div>
  );
}

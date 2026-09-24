import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { useToast } from './Toast.jsx';
import { inr } from '../lib/format.js';

const PinCtx = createContext(null);

/**
 * askPin({ title, subtitle, amount }) opens the UPI PIN pad and resolves to the
 * entered PIN, or null if the user cancels.
 */
export function PinProvider({ children }) {
  const [req, setReq] = useState(null);
  const [pin, setPin] = useState('');
  const resolver = useRef(null);

  const askPin = useCallback((opts = {}) => new Promise((resolve) => {
    resolver.current = resolve;
    setPin('');
    setReq(opts);
  }), []);

  const finish = useCallback((value) => {
    resolver.current?.(value);
    resolver.current = null;
    setReq(null);
    setPin('');
  }, []);

  const press = useCallback((k) => {
    if (k === 'del') setPin((p) => p.slice(0, -1));
    else setPin((p) => (p.length < 6 ? p + k : p));
  }, []);

  const canSubmit = pin.length === 4 || pin.length === 6;

  useEffect(() => {
    if (!req) return undefined;
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter' && canSubmit) finish(pin);
      else if (e.key === 'Escape') finish(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req, press, finish, pin, canSubmit]);

  return (
    <PinCtx.Provider value={askPin}>
      {children}
      {req && (
        <div className="pin-screen" role="dialog" aria-modal="true" aria-label="Enter UPI PIN">
          <div className="pin-screen__top">
            <button className="icon-btn icon-btn--light" onClick={() => finish(null)} aria-label="Cancel"><Icon name="x" /></button>
            <div className="pin-screen__brand"><Icon name="shield" size={16} /> Secured by PayFlow UPI</div>
          </div>
          <div className="pin-screen__info">
            <p>{req.title || 'Confirm payment'}</p>
            {req.amount != null && <h2>{inr(req.amount, { decimals: 2 })}</h2>}
            {req.subtitle && <span>{req.subtitle}</span>}
          </div>
          <div className="pin-screen__entry">
            <label>ENTER UPI PIN</label>
            <div className="pin-dots">
              {Array.from({ length: pin.length > 4 ? 6 : 4 }, (_, i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
            </div>
            <small className="muted">Demo PIN is 1234</small>
          </div>
          <div className="keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map((k) => (
              k === 'ok' ? (
                <button key={k} className="key key--ok" disabled={!canSubmit} onClick={() => finish(pin)} aria-label="Submit PIN">
                  <Icon name="check" size={26} />
                </button>
              ) : k === 'del' ? (
                <button key={k} className="key key--fn" onClick={() => press('del')} aria-label="Delete"><Icon name="backspace" /></button>
              ) : (
                <button key={k} className="key" onClick={() => press(k)}>{k}</button>
              )
            ))}
          </div>
        </div>
      )}
    </PinCtx.Provider>
  );
}

/**
 * Wraps an action that needs a UPI PIN: prompts, runs, and re-prompts on a
 * wrong PIN. Resolves to the action's result, or null if cancelled/failed.
 */
export function useSecureAction() {
  const askPin = useContext(PinCtx);
  const toast = useToast();
  return useCallback(async (opts, action) => {
    for (;;) {
      const pin = await askPin(opts);
      if (pin == null) return null;
      try {
        return await action(pin);
      } catch (e) {
        toast(e.message, 'error');
        if (e.code !== 'wrong_pin') return null;
      }
    }
  }, [askPin, toast]);
}

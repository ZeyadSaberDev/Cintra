import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, LoaderCircle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let frame: number | undefined;
    let timer: number | undefined;
    if (open) {
      setError('');
      setMounted(true);
      frame = window.requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      timer = window.setTimeout(() => setMounted(false), 220);
    }
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  if (!mounted) return null;
  return createPortal(
    <div
      className={`bayan-confirm-backdrop ${visible ? 'is-visible' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bayan-confirm-title"
        aria-describedby="bayan-confirm-description"
        className={`bayan-confirm-panel ${visible ? 'is-visible' : ''}`}
      >
        <div className="bayan-confirm-icon"><AlertTriangle size={20} /></div>
        <button
          type="button"
          className="bayan-confirm-close"
          aria-label={cancelLabel}
          disabled={busy}
          onClick={onClose}
        >
          <X size={17} />
        </button>
        <h2 id="bayan-confirm-title">{title}</h2>
        <p id="bayan-confirm-description">{description}</p>
        {error && <p className="bayan-confirm-error" role="alert">{error}</p>}
        <div className="bayan-confirm-actions">
          <button type="button" className="bayan-confirm-cancel" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="button" className="bayan-confirm-submit" disabled={busy} onClick={() => void confirm()}>
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

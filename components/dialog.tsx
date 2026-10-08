'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function Dialog({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open) { dialog?.showModal(); document.body.style.overflow = 'hidden'; }
    else dialog?.close();
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  return <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby={`dialog-${title.replaceAll(' ', '-')}`}>
    <div className="dialog-header"><h2 id={`dialog-${title.replaceAll(' ', '-')}`}>{title}</h2><button onClick={onClose} className="icon-button" aria-label={`Close ${title}`}><X size={21} /></button></div>
    {children}
  </dialog>;
}

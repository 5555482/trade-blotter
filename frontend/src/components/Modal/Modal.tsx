import { memo, useEffect, useRef } from 'react';

interface ModalProps {
  onClose: () => void;
  labelId?: string;
  describedById?: string;
  canClose?: boolean;
  children: React.ReactNode;
}

interface HeaderProps {
  id?: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  disabled?: boolean;
}

interface BodyProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

interface FooterProps {
  children: React.ReactNode;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function ModalRoot({ onClose, labelId, describedById, canClose = true, children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Restore focus to the element that was active before the modal opened
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    return () => trigger?.focus();
  }, []);

  // Escape key + Tab focus trap
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && canClose) { onClose(); return; }
      if (e.key !== 'Tab' || !overlayRef.current) return;

      const focusable = Array.from(overlayRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last  = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, canClose]);

  return (
    <div
      ref={overlayRef}
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
      aria-describedby={describedById}
      onClick={(e) => { if (e.target === e.currentTarget && canClose) onClose(); }}
    >
      {children}
    </div>
  );
}

const ModalHeader = memo(function ModalHeader({ id, title, subtitle, onClose, disabled }: HeaderProps) {
  return (
    <div className="modal__header">
      <div>
        <h2 id={id} className="modal__title">{title}</h2>
        {subtitle && <div className="modal__subtitle">{subtitle}</div>}
      </div>
      <button className="modal__close-btn" onClick={onClose} disabled={disabled} aria-label="Close">×</button>
    </div>
  );
});

const ModalBody = memo(function ModalBody({ children, style }: BodyProps) {
  return <div className="modal__body" style={style}>{children}</div>;
});

const ModalFooter = memo(function ModalFooter({ children }: FooterProps) {
  return <div className="modal__footer">{children}</div>;
});

export const Modal = Object.assign(ModalRoot, {
  Header: ModalHeader,
  Body:   ModalBody,
  Footer: ModalFooter,
});

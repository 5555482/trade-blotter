import { memo, useEffect } from 'react';

interface ModalProps {
  onClose: () => void;
  labelId?: string;
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

function ModalRoot({ onClose, labelId, canClose = true, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && canClose) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, canClose]);

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
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

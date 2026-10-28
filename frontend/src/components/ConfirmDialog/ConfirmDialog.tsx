import { memo, useEffect, useRef } from 'react';
import { Modal } from '../Modal/Modal';

interface Props {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog = memo(function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { cancelRef.current?.focus(); }, []);

  return (
    <Modal onClose={onCancel} labelId="confirm-title" describedById="confirm-message">
      <div className="modal modal--sm">
        <Modal.Body style={{ paddingTop: 22 }}>
          <div className="confirm__icon">⚠</div>
          <h2 id="confirm-title" className="confirm__title">{title}</h2>
          <p id="confirm-message" className="confirm__message">{message}</p>
        </Modal.Body>
        <Modal.Footer>
          <button ref={cancelRef} className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn btn-danger-fill" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </Modal.Footer>
      </div>
    </Modal>
  );
});

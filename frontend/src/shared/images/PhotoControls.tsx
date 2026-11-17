import { IconPhoto, IconTrash } from '@tabler/icons-react';
import { type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ghostButton, primaryButton, secondaryButton } from '../ui/styles';
import type { CropShape } from './CropCanvas';
import { ImageUploadDialog } from './ImageUploadDialog';
import { RemoveImageDialog } from './RemoveImageDialog';

type Dialog = 'upload' | 'remove' | null;

interface Props {
  /** Avatar ali drug prikaz trenutne slike. */
  preview: ReactNode;
  hasPhoto: boolean;
  /** Brez pravice (vloga, arhivirana skupina) akcij ni. */
  canEdit: boolean;
  shape: CropShape;
  /** Naslov dialoga nalaganja. */
  title: string;
  /** Sporočilo po uspešnem nalaganju in odstranitvi. */
  uploadedMessage: string;
  removedMessage: string;
  /** Zavrnitev se prikaže v dialogu; ob uspehu se dialog zapre. */
  onUpload: (file: Blob) => Promise<void>;
  onRemove: () => Promise<void>;
}

/**
 * Gumbi *Naloži/Zamenjaj/Odstrani sliko* z dialogoma (design.md 8.10, 8.11, 8.12): skupni razdelek slike skupine in
 * kontakta. Fokus se po zaprtju vrne na gumb, ki je dialog odprl (po odstranitvi na gumb za nalaganje).
 */
export function PhotoControls({
  preview,
  hasPhoto,
  canEdit,
  shape,
  title,
  uploadedMessage,
  removedMessage,
  onUpload,
  onRemove,
}: Props) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [message, setMessage] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);

  const close = () => {
    setDialog(null);
    queueMicrotask(() =>
      (trigger.current?.isConnected ? trigger.current : uploadButton.current)?.focus(),
    );
  };
  const open = (kind: Exclude<Dialog, null>, button: HTMLButtonElement) => {
    trigger.current = button;
    setMessage(null);
    setDialog(kind);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        {preview}
        {canEdit && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              ref={uploadButton}
              className={hasPhoto ? secondaryButton : primaryButton}
              onClick={(event) => open('upload', event.currentTarget)}
            >
              <IconPhoto aria-hidden="true" size={20} stroke={1.75} />
              {hasPhoto ? t('images.replace') : t('images.upload')}
            </button>
            {hasPhoto && (
              <button
                type="button"
                className={`${ghostButton} text-destructive`}
                onClick={(event) => open('remove', event.currentTarget)}
              >
                <IconTrash aria-hidden="true" size={20} stroke={1.75} />
                {t('images.remove')}
              </button>
            )}
          </div>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {canEdit && (
        <>
          <ImageUploadDialog
            open={dialog === 'upload'}
            onClose={close}
            shape={shape}
            title={title}
            onUpload={async (file) => {
              await onUpload(file);
              setMessage(uploadedMessage);
              close();
            }}
          />
          <RemoveImageDialog
            open={dialog === 'remove'}
            onClose={close}
            onConfirm={async () => {
              await onRemove();
              setMessage(removedMessage);
              close();
            }}
          />
        </>
      )}
    </div>
  );
}

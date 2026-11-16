import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useImageApi } from '../../shared/images/imageApi';
import { Avatar } from '../../shared/images/Avatar';
import { ImageUploadDialog } from '../../shared/images/ImageUploadDialog';
import { RemoveImageDialog } from '../../shared/images/RemoveImageDialog';
import { primaryButton, secondaryButton } from '../../shared/ui/styles';
import { useAuth } from '../auth/authContext';

type Dialog = 'upload' | 'remove' | null;

/**
 * Razdelek *Profilna slika* (design.md 9.9; FR-018-01, -02, -04): avatar, nalaganje z obrezovanjem (okrogel okvir),
 * zamenjava in odstranitev s potrditvijo. Po uspehu se avatar takoj spremeni tudi v meniju računa.
 */
export function ProfilePhotoSection() {
  const { t } = useTranslation();
  const { profile, setPhotoRevision } = useAuth();
  const api = useImageApi();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [message, setMessage] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  if (!profile) return null;

  const hasPhoto = profile.photoRevision != null;
  const close = () => {
    setDialog(null);
    // Fokus se vrne na gumb, ki je dialog odprl (design.md 8.12).
    // Gumb *Odstrani sliko* po odstranitvi izgine: fokus tedaj prevzame gumb za nalaganje.
    queueMicrotask(() =>
      (trigger.current?.isConnected ? trigger.current : uploadButton.current)?.focus(),
    );
  };

  return (
    <section aria-labelledby="account-photo" className="flex flex-col gap-3">
      <h2 id="account-photo" className="text-xl font-bold">
        {t('images.profile.heading')}
      </h2>
      <p className="text-muted-foreground">{t('images.profile.description')}</p>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar
          kind="user"
          name={profile.name ?? profile.email}
          colorSeed={profile.email}
          size={128}
          photo={{ path: '/me/photo', revision: profile.photoRevision }}
        />
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            ref={uploadButton}
            className={hasPhoto ? secondaryButton : primaryButton}
            onClick={(event) => {
              trigger.current = event.currentTarget;
              setMessage(null);
              setDialog('upload');
            }}
          >
            {hasPhoto ? t('images.replace') : t('images.upload')}
          </button>
          {hasPhoto && (
            <button
              type="button"
              className={secondaryButton}
              onClick={(event) => {
                trigger.current = event.currentTarget;
                setMessage(null);
                setDialog('remove');
              }}
            >
              {t('images.remove')}
            </button>
          )}
        </div>
      </div>
      {message && <p role="status">{message}</p>}

      <ImageUploadDialog
        open={dialog === 'upload'}
        onClose={close}
        shape="circle"
        title={t('images.profile.heading')}
        onUpload={async (file) => {
          const result = await api.upload({ kind: 'me' }, file);
          setPhotoRevision(result.photoRevision);
          setMessage(t('images.profile.uploaded'));
          close();
        }}
      />
      <RemoveImageDialog
        open={dialog === 'remove'}
        onClose={close}
        onConfirm={async () => {
          await api.remove({ kind: 'me' });
          setPhotoRevision(null);
          setMessage(t('images.profile.removed'));
          close();
        }}
      />
    </section>
  );
}

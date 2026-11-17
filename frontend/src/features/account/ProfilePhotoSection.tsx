import { IconPhoto, IconTrash } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { imageErrorCode, useImageApi } from '../../shared/images/imageApi';
import { Avatar } from '../../shared/images/Avatar';
import type { ImageErrorCode } from '../../shared/images/photoTypes';
import { ImageUploadDialog } from '../../shared/images/ImageUploadDialog';
import { RemoveImageDialog } from '../../shared/images/RemoveImageDialog';
import { Callout } from '../../shared/ui/Callout';
import { ghostButton, primaryButton, secondaryButton } from '../../shared/ui/styles';
import { useAuth } from '../auth/authContext';

type Dialog = 'upload' | 'remove' | null;

/**
 * Razdelek *Profilna slika* (design.md 9.9; FR-018-01, -02, -04): avatar, nalaganje z obrezovanjem (okrogel okvir),
 * zamenjava in odstranitev s potrditvijo. Po uspehu se avatar takoj spremeni tudi v meniju računa.
 */
export function ProfilePhotoSection() {
  const { t } = useTranslation();
  const { profile, setPhotoRevision, hasGooglePhoto } = useAuth();
  const api = useImageApi();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [googleFailure, setGoogleFailure] = useState<ImageErrorCode | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  if (!profile) return null;

  const hasPhoto = profile.photoRevision != null;
  const adoptGoogle = async () => {
    if (googleBusy) return;
    setGoogleBusy(true);
    setGoogleFailure(null);
    setMessage(null);
    try {
      const result = await api.fromGoogle();
      setPhotoRevision(result.photoRevision);
      setMessage(t('images.google.done'));
    } catch (error) {
      setGoogleFailure(imageErrorCode(error));
    } finally {
      setGoogleBusy(false);
    }
  };
  const close = () => {
    setDialog(null);
    // Fokus se vrne na gumb, ki je dialog odprl (design.md 8.12).
    // Gumb *Odstrani sliko* po odstranitvi izgine: fokus tedaj prevzame gumb za nalaganje.
    queueMicrotask(() =>
      (trigger.current?.isConnected ? trigger.current : uploadButton.current)?.focus(),
    );
  };

  return (
    <section
      aria-labelledby="account-photo"
      className="flex flex-wrap items-center gap-5 border-t border-border pt-5"
    >
      <Avatar
        kind="user"
        name={profile.name ?? profile.email}
        colorSeed={profile.email}
        size={96}
        photo={{ path: '/me/photo', revision: profile.photoRevision }}
      />
      <div className="flex min-w-56 flex-1 flex-col gap-3">
        <div>
          <h3 id="account-photo" className="font-medium">
            {t('images.profile.heading')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('images.profile.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
            <IconPhoto aria-hidden="true" size={20} stroke={1.75} />
            {hasPhoto ? t('images.replace') : t('images.upload')}
          </button>
          {hasGooglePhoto && (
            <button
              type="button"
              className={`${ghostButton} text-primary`}
              aria-disabled={googleBusy}
              onClick={() => void adoptGoogle()}
            >
              {t('images.google.use')}
            </button>
          )}
          {hasPhoto && (
            <button
              type="button"
              className={`${ghostButton} text-destructive`}
              onClick={(event) => {
                trigger.current = event.currentTarget;
                setMessage(null);
                setDialog('remove');
              }}
            >
              <IconTrash aria-hidden="true" size={20} stroke={1.75} />
              {t('images.remove')}
            </button>
          )}
        </div>
        {message && <p role="status">{message}</p>}
        {googleFailure && <Callout tone="error">{t(`images.errors.${googleFailure}`)}</Callout>}
      </div>

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

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Avatar } from '../../shared/images/Avatar';
import { useImageApi } from '../../shared/images/imageApi';
import { PhotoControls } from '../../shared/images/PhotoControls';
import { useGroup } from '../groups/groupContext';
import type { ContactDetail } from './types';

/**
 * Razdelek *Slika kontakta* v obrazcu (FR-018-09, -10): sprememba velja takoj prek API-ja (ločeno od shranjevanja polj),
 * poveča verzijo kontakta, zato jo obrazec prevzame (`onVersion`) in shranjevanje polj ne sproži lažnega konflikta.
 * Pri novem kontaktu slike še ni mogoče dodati (kontakt še nima identitete).
 */
export function ContactPhotoSection({
  contact,
  version,
  onVersion,
}: {
  contact?: ContactDetail;
  version: number;
  onVersion: (version: number) => void;
}) {
  const { t } = useTranslation();
  const api = useImageApi();
  const { group } = useGroup();
  const headingId = useId();
  const [revision, setRevision] = useState(contact?.photoRevision ?? null);
  const name = contact?.displayName ?? '';

  return (
    <div role="group" aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-lg font-bold">
        {t('images.contact.heading')}
      </h3>
      {contact ? (
        <PhotoControls
          preview={
            <Avatar
              kind="contact"
              name={name}
              colorSeed={contact.id}
              size={64}
              alt=""
              photo={{ path: `/groups/${group.id}/contacts/${contact.id}/photo`, revision }}
            />
          }
          hasPhoto={revision !== null}
          canEdit={!group.archived}
          shape="circle"
          title={t('images.contact.heading')}
          uploadedMessage={t('images.contact.uploaded')}
          removedMessage={t('images.contact.removed')}
          onUpload={async (file) => {
            const target = { kind: 'contact', groupId: group.id, contactId: contact.id } as const;
            const result = await api.upload(target, file, version);
            setRevision(result.photoRevision);
            if (result.version !== undefined) onVersion(result.version);
          }}
          onRemove={async () => {
            const target = { kind: 'contact', groupId: group.id, contactId: contact.id } as const;
            const result = await api.remove(target, version);
            setRevision(result.photoRevision);
            if (result.version !== undefined) onVersion(result.version);
          }}
        />
      ) : (
        <p className="text-muted-foreground">{t('images.contact.hint')}</p>
      )}
    </div>
  );
}

import { IconMapPin } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogTrigger } from '../../shared/ui/dialog';
import { secondaryButton } from '../../shared/ui/styles';
import { MapDialog } from './MapDialog';

/**
 * *Pokaži na zemljevidu* (016, FR-016-20): gumb pri vsakem nepraznem naslovu z dostopnim imenom, ki vsebuje ime
 * naslova; odpre {@link MapDialog}. *Esc* zapre dialog in fokus se vrne na gumb (design.md 8.10).
 */
export function ShowOnMapButton({
  groupId,
  contactId,
  attributeKey,
  name,
  address,
}: {
  groupId: string;
  contactId: string;
  attributeKey?: string;
  name: string;
  address: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (address.trim() === '') return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="mt-2">
        <DialogTrigger className={secondaryButton} aria-label={t('map.show', { name })}>
          <IconMapPin aria-hidden="true" size={20} stroke={1.75} />
          {t('map.showShort')}
        </DialogTrigger>
      </div>
      {open && (
        <MapDialog
          groupId={groupId}
          contactId={contactId}
          attributeKey={attributeKey}
          name={name}
          address={address}
        />
      )}
    </Dialog>
  );
}

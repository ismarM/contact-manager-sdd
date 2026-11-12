import { focusRing } from '../../../shared/ui/styles';
import { useTranslation } from 'react-i18next';

/** Potrditveno polje vrstice ali kartice »Izberi ‹prikazno ime›« (FR-009-01). */
export function SelectContact({
  name,
  checked,
  onChange,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  return (
    <input
      type="checkbox"
      aria-label={t('contacts.selection.selectContact', { name })}
      checked={checked}
      onChange={onChange}
      className={`size-6 accent-primary ${focusRing}`}
    />
  );
}

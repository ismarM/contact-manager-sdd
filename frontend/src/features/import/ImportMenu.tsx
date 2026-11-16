import { IconChevronDown, IconFileImport } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu';
import { secondaryButton } from '../../shared/ui/styles';

/** Meni *Uvozi* na seznamu kontaktov (FR-014-01; design.md 8.16): izbira Excela ali vizitk; samo za urednike. */
export function ImportMenu({ base }: { base: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className={secondaryButton}>
        <IconFileImport aria-hidden="true" size={20} stroke={1.75} />
        {t('contacts.importMenu.button')}
        <IconChevronDown aria-hidden="true" size={16} stroke={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void navigate(`${base}/import?source=xlsx`)}>
          {t('contacts.importMenu.xlsx')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate(`${base}/import?source=vcf`)}>
          {t('contacts.importMenu.vcf')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

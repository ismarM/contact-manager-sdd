import { IconUserCircle } from '@tabler/icons-react';
import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useAuth } from '../../features/auth/authContext';
import type { Language } from '../../i18n/language';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

/** Meni računa (design.md 7.1, 8.16; FR-001-12): Moj račun, jezik, Odjava. */
export function AccountMenu() {
  const { t, i18n } = useTranslation();
  const { profile, changeLanguage, signOut } = useAuth();
  const navigate = useNavigate();
  const trigger = useRef<HTMLButtonElement>(null);
  const languageLabel = useId();

  if (!profile) return null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        ref={trigger}
        aria-label={t('shell.accountMenu')}
        className="flex size-11 items-center justify-center rounded-full border border-border bg-selected text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:size-12"
      >
        {/* Ikona brez besedila (CR-01): dostopno ime je samo »Meni računa« (WCAG 2.5.3). */}
        <IconUserCircle aria-hidden="true" size={24} stroke={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-w-[calc(100vw-2rem)]"
        onCloseAutoFocus={(event) => {
          // Fokus se vrne na gumb tudi ob kliku drugam (design.md 8.16).
          event.preventDefault();
          trigger.current?.focus();
        }}
      >
        <DropdownMenuLabel className="truncate">{profile.name ?? profile.email}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void navigate('/account')}>
          {t('shell.myAccount')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel id={languageLabel}>{t('language.label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          aria-labelledby={languageLabel}
          value={i18n.language}
          onValueChange={(value) => changeLanguage(value as Language)}
        >
          <DropdownMenuRadioItem value="sl" lang="sl">
            {t('language.sl')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en" lang="en">
            {t('language.en')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>{t('shell.signOut')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

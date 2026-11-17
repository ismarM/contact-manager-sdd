import { IconSelector } from '@tabler/icons-react';
import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useAuth } from '../../features/auth/authContext';
import type { Language } from '../../i18n/language';
import { Avatar } from '../images/Avatar';
import { cn } from '../lib/cn';
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
import { focusRing } from '../ui/styles';

/**
 * Meni računa (design.md 7.1, 8.16; FR-001-12, FR-020-05, FR-020-09): *Moj račun*, jezik, *Odjava*. Sprožilec je
 * postavka računa na dnu stranske vrstice (`item`: slika, ime, e-naslov) ali samo slika v zgornji vrstici pod 1024 px
 * (`avatar`). Dostopno ime obeh je »Meni računa« (avatar je okras, WCAG 2.5.3 – CR-01). Stikala teme tu ni (FR-020-09).
 */
export function AccountMenu({
  variant,
  className,
}: {
  variant: 'item' | 'avatar';
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const { profile, changeLanguage, signOut } = useAuth();
  const navigate = useNavigate();
  const trigger = useRef<HTMLButtonElement>(null);
  const languageLabel = useId();

  if (!profile) return null;
  const name = profile.name ?? profile.email;
  const avatar = (
    <Avatar
      kind="user"
      name={name}
      colorSeed={profile.email}
      size={variant === 'item' ? 32 : 40}
      alt=""
      photo={{ path: '/me/photo', revision: profile.photoRevision }}
    />
  );

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        ref={trigger}
        aria-label={t('shell.accountMenu')}
        className={cn(
          variant === 'item'
            ? 'flex min-h-14 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-card'
            : 'flex size-11 items-center justify-center rounded-full pointer-coarse:size-12',
          focusRing,
          className,
        )}
      >
        {avatar}
        {variant === 'item' && (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-bold text-foreground">{name}</span>
              {profile.name && (
                <span className="truncate text-sm text-muted-foreground">{profile.email}</span>
              )}
            </span>
            <IconSelector
              aria-hidden="true"
              size={20}
              stroke={1.75}
              className="shrink-0 text-muted-foreground"
            />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === 'item' ? 'start' : 'end'}
        side={variant === 'item' ? 'top' : 'bottom'}
        className="max-w-[calc(100vw-2rem)]"
        onCloseAutoFocus={(event) => {
          // Fokus se vrne na gumb tudi ob kliku drugam (design.md 8.16).
          event.preventDefault();
          trigger.current?.focus();
        }}
      >
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
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

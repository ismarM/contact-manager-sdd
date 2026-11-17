import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogTitle } from '../../shared/ui/dialog';
import { focusRing, ghostButton, primaryButton, secondaryButton } from '../../shared/ui/styles';
import { CountryField } from './CountryField';
import { countryName } from './countries';
import { useUiLanguage } from './useUiLanguage';

/**
 * Stanje pogovornega okna ročnega prenosa starega atributa v polje (FR-013-20): `conflict` = polje že ima drugačno
 * vrednost (odločitev), `pick` = država ni samodejno prepoznana (izbira države).
 */
export type TransferRequest =
  | {
      rowId: string;
      kind: 'company' | 'country';
      mode: 'conflict';
      attribute: string;
      /** Vrednost polja (pri državi koda). */
      fieldValue: string;
      /** Samo država: koda, v katero bi se prepoznal atribut. */
      found?: string;
    }
  | {
      rowId: string;
      kind: 'country';
      mode: 'pick';
      attribute: string;
      /** Kode kandidatov (dvoumno); prazno = neprepoznano. */
      candidates: string[];
    };

/**
 * Pogovorno okno prenosa (design.md 8.10): pokaže vrednost atributa in zahteva odločitev. `onDecide(null)` obdrži
 * vrednost polja in odstrani atribut, `onDecide(vrednost)` jo zapiše v polje. Prenos je samo sprememba stanja obrazca.
 */
export function AttributeTransferDialog({
  request,
  onDecide,
  onCancel,
}: {
  request: TransferRequest;
  onDecide: (value: string | null) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const language = useUiLanguage();
  const title = t(`contacts.transfer.action.${request.kind}`);
  const show = (code: string) => (request.kind === 'country' ? countryName(code, language) : code);
  const first = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          if (request.mode === 'conflict') {
            event.preventDefault();
            first.current?.focus();
          }
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        {request.mode === 'conflict' ? (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="font-bold">{t('contacts.transfer.attributeValue')}</dt>
              <dd className="break-words">{request.attribute}</dd>
              <dt className="font-bold">{t('contacts.transfer.fieldValue')}</dt>
              <dd className="break-words">{show(request.fieldValue)}</dd>
              {request.found && (
                <>
                  <dt className="font-bold">{t('contacts.transfer.recognized')}</dt>
                  <dd className="break-words">{show(request.found)}</dd>
                </>
              )}
            </dl>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                ref={first}
                type="button"
                className={primaryButton}
                onClick={() => onDecide(null)}
              >
                {t('contacts.transfer.keepField')}
              </button>
              <button
                type="button"
                className={secondaryButton}
                onClick={() => onDecide(request.found ?? request.attribute)}
              >
                {t('contacts.transfer.replaceField')}
              </button>
              <button type="button" className={ghostButton} onClick={onCancel}>
                {t('contacts.transfer.cancel')}
              </button>
            </div>
          </>
        ) : (
          <PickCountry request={request} onDecide={onDecide} onCancel={onCancel} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickCountry({
  request,
  onDecide,
  onCancel,
}: {
  request: Extract<TransferRequest, { mode: 'pick' }>;
  onDecide: (value: string | null) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const language = useUiLanguage();
  const name = useId();
  const [chosen, setChosen] = useState('');
  const ambiguous = request.candidates.length > 0;
  const choices = request.candidates
    .map((code) => ({ code, label: countryName(code, language) }))
    .sort((a, b) => a.label.localeCompare(b.label, language));
  return (
    <>
      <p>{t(ambiguous ? 'contacts.transfer.ambiguous' : 'contacts.transfer.unknown')}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4">
        <dt className="font-bold">{t('contacts.transfer.attributeValue')}</dt>
        <dd className="break-words">{request.attribute}</dd>
      </dl>
      {ambiguous ? (
        <fieldset className="flex flex-col">
          <legend className="mb-1 font-bold">{t('contacts.transfer.pickLegend')}</legend>
          {choices.map((choice) => (
            <label key={choice.code} className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name={name}
                checked={chosen === choice.code}
                onChange={() => setChosen(choice.code)}
                className={`size-5 shrink-0 accent-primary ${focusRing}`}
              />
              {choice.label}
            </label>
          ))}
        </fieldset>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${name}-country`} className="font-bold">
            {t('contacts.form.country')}
          </label>
          <CountryField
            id={`${name}-country`}
            value={chosen}
            onChange={setChosen}
            listLabel={t('contacts.form.countryList')}
          />
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          className={primaryButton}
          aria-disabled={chosen === ''}
          onClick={() => {
            if (chosen !== '') onDecide(chosen);
          }}
        >
          {t('contacts.transfer.action.country')}
        </button>
        <button type="button" className={ghostButton} onClick={onCancel}>
          {t('contacts.transfer.cancel')}
        </button>
      </div>
    </>
  );
}

import { useTranslation } from 'react-i18next';

import {
  ADDRESS_FORMATS,
  DATE_FORMATS,
  type DisplayFormats,
  PHONE_FORMATS,
} from '../formats/types';
import { useDisplayFormats } from '../formats/displayFormatsContext';
import { Callout } from '../../shared/ui/Callout';
import { card, focusRing } from '../../shared/ui/styles';

const radio = `size-5 accent-primary ${focusRing}`;
const option = 'flex min-h-11 items-center gap-3 pointer-coarse:min-h-12';

type Group = 'phone' | 'date' | 'address';

const GROUPS: { group: Group; field: keyof DisplayFormats; values: readonly string[] }[] = [
  { group: 'phone', field: 'phoneFormat', values: PHONE_FORMATS },
  { group: 'date', field: 'dateFormat', values: DATE_FORMATS },
  { group: 'address', field: 'addressFormat', values: ADDRESS_FORMATS },
];

/** Moj račun – Oblika zapisa (FR-016-16, FR-016-17): prva vrednost skupine je privzeta (v profilu `null`). */
export function DisplayFormatSection() {
  const { t } = useTranslation();
  const { formats, change, saveStatus } = useDisplayFormats();

  return (
    <section aria-labelledby="account-formats" className={`${card} flex flex-col gap-5 p-4 md:p-6`}>
      <div>
        <h2 id="account-formats" className="text-xl font-semibold">
          {t('account.formats.heading')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('account.formats.description')}</p>
      </div>
      {GROUPS.map(({ group, field, values }) => (
        <fieldset key={group} className="flex flex-col">
          <legend className="mb-2 font-medium">{t(`account.formats.${group}.label`)}</legend>
          {values.map((value, index) => (
            <label key={value} className={option}>
              <input
                type="radio"
                name={`format-${group}`}
                value={value}
                checked={(formats[field] ?? values[0]) === value}
                onChange={() => change({ [field]: index === 0 ? null : value })}
                className={radio}
              />
              {t(`account.formats.${group}.${value}` as 'account.formats.phone.E164')}
              {index === 0 && ` · ${t('account.formats.default')}`}
            </label>
          ))}
        </fieldset>
      ))}
      <div role="status">{saveStatus === 'saved' && <p>{t('account.formats.saved')}</p>}</div>
      {saveStatus === 'failed' && <Callout tone="error">{t('account.formats.failed')}</Callout>}
    </section>
  );
}

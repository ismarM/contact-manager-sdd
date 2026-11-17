import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DialogClose, DialogContent, DialogTitle } from '../../shared/ui/dialog';
import { errorAlert, focusRing, secondaryButton, warningAlert } from '../../shared/ui/styles';
import { useAuth } from '../auth/authContext';
import { useUiLanguage } from '../contacts/useUiLanguage';
import { type AddressLocation, fetchAddressLocation, fetchMapTile } from './api';

const MapView = lazy(() => import('./MapView'));

const LINK = `text-primary underline decoration-1 underline-offset-[3px] ${focusRing}`;
const OSM = 'https://www.openstreetmap.org';

type State =
  { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; location: AddressLocation };

/** Izid zahtevka za določen ključ (kontakt, naslov, jezik, poskus); drug ključ pomeni nalaganje. */
interface Outcome {
  request: string;
  state: State;
}

/** Koordinate na 5 decimalk (približno 1 m) v obliki jezika vmesnika. */
function coordinate(value: number, language: 'sl' | 'en') {
  return value.toLocaleString(language, { minimumFractionDigits: 5, maximumFractionDigits: 5 });
}

/**
 * Vsebina dialoga zemljevida (016, FR-016-21, FR-016-22, FR-016-27; design.md 8.10, 8.13): lokacija iz zaledja,
 * zemljevid z oznako, naslov po shemi uporabnika, besedilni opis lokacije, pripis © OpenStreetMap in povezava v zunanjo
 * aplikacijo (samo navigacija na klik). Nenajden naslov in približna lokacija sta sporočili, ne napaki; nedosegljiva
 * storitev je trajno sporočilo s *Poskusi znova*.
 */
export function MapDialog({
  groupId,
  contactId,
  attributeKey,
  name,
  address,
}: {
  groupId: string;
  contactId: string;
  /** Ključ atributa tipa *Naslov*; `undefined` = predefiniran naslov. */
  attributeKey?: string;
  /** Ime naslova (»Naslov« ali ključ atributa). */
  name: string;
  /** Naslov po shemi uporabnika (večvrstično besedilo). */
  address: string;
}) {
  const { t } = useTranslation();
  const language = useUiLanguage();
  const { authFetch, authFetchBlob } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const request = JSON.stringify([groupId, contactId, attributeKey ?? null, language, attempt]);
  const state: State = outcome?.request === request ? outcome.state : { kind: 'loading' };

  useEffect(() => {
    let active = true;
    fetchAddressLocation(authFetch, groupId, contactId, attributeKey, language).then(
      (location) => {
        if (active) setOutcome({ request, state: { kind: 'ready', location } });
      },
      () => {
        if (active) setOutcome({ request, state: { kind: 'failed' } });
      },
    );
    return () => {
      active = false;
    };
  }, [authFetch, groupId, contactId, attributeKey, language, request]);

  const loadTile = useCallback(
    (z: number, x: number, y: number, signal: AbortSignal) =>
      fetchMapTile(authFetchBlob, z, x, y, signal),
    [authFetchBlob],
  );

  const oneLine = address.split('\n').filter(Boolean).join(', ');
  const search = `${OSM}/search?query=${encodeURIComponent(oneLine)}`;
  const location = state.kind === 'ready' ? state.location : null;
  const found =
    location !== null &&
    location.status !== 'NOT_FOUND' &&
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number'
      ? { lat: location.latitude, lon: location.longitude, exact: location.status === 'EXACT' }
      : null;

  return (
    <DialogContent className="sm:max-w-[640px]">
      <DialogTitle>{t('map.title', { name })}</DialogTitle>
      <p className="break-words whitespace-pre-line">{address}</p>

      {state.kind === 'loading' && <p role="status">{t('map.loading')}</p>}

      {state.kind === 'failed' && (
        <div role="alert" className={`${errorAlert} flex flex-col items-start gap-3`}>
          <p>{t('map.unavailable')}</p>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => setAttempt((n) => n + 1)}
          >
            {t('map.retry')}
          </button>
        </div>
      )}

      {location?.status === 'NOT_FOUND' && (
        <p role="status" className={warningAlert}>
          {t('map.notFound')}
        </p>
      )}

      {found && !found.exact && (
        <p role="note" className={warningAlert}>
          {t('map.approximate')}
        </p>
      )}

      {found && (
        <>
          <Suspense fallback={<p role="status">{t('map.loading')}</p>}>
            <MapView
              latitude={found.lat}
              longitude={found.lon}
              zoom={found.exact ? 17 : 14}
              label={t('map.region', { name })}
              loadTile={loadTile}
            />
          </Suspense>
          <p>
            {t(found.exact ? 'map.descriptionExact' : 'map.descriptionApproximate', {
              lat: coordinate(found.lat, language),
              lon: coordinate(found.lon, language),
            })}
          </p>
          <p className="text-sm">
            <a href={`${OSM}/copyright`} target="_blank" rel="noopener noreferrer" className={LINK}>
              {t('map.attribution')}
            </a>
          </p>
        </>
      )}

      {state.kind === 'ready' && (
        <ul className="flex flex-col gap-2">
          {found && (
            <li>
              <a
                href={`${OSM}/?mlat=${found.lat}&mlon=${found.lon}#map=${found.exact ? 17 : 14}/${found.lat}/${found.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK}
                aria-label={`${t('map.openExternal')} ${t('map.newTab')}`}
              >
                {t('map.openExternal')}
              </a>
            </li>
          )}
          {(!found || !found.exact) && (
            <li>
              <a
                href={search}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK}
                aria-label={`${t('map.searchExternal')} ${t('map.newTab')}`}
              >
                {t('map.searchExternal')}
              </a>
            </li>
          )}
        </ul>
      )}

      <div className="flex flex-wrap gap-3">
        <DialogClose className={secondaryButton}>{t('map.close')}</DialogClose>
      </div>
    </DialogContent>
  );
}

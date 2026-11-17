import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { focusRing } from '../../shared/ui/styles';
import { AuthTileLayer, type TileLoader } from './authTileLayer';

/** Tabler `map-pin-filled` (MIT) kot oznaka; barva iz žetona `primary` (design.md 4.1). */
const PIN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.364 4.636a9 9 0 0 1 .203 12.519l-.203 .21l-4.243 4.242a3 3 0 0 1 -4.097 .135l-.144 -.135l-4.244 -4.243a9 9 0 0 1 12.728 -12.728zm-6.364 3.364a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z"/></svg>';

/**
 * Vgrajen zemljevid (016, FR-016-21, FR-016-27; research R-09): Leaflet s ploščicami prek našega strežnika, oznaka na
 * lokaciji, premikanje s puščicami in povečava s `+`/`−` (fokusiran vsebnik). Pripis in opis sta v dialogu.
 */
export default function MapView({
  latitude,
  longitude,
  zoom,
  label,
  loadTile,
}: {
  latitude: number;
  longitude: number;
  zoom: number;
  label: string;
  loadTile: TileLoader;
}) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const loader = useRef(loadTile);

  useEffect(() => {
    loader.current = loadTile;
  }, [loadTile]);

  useEffect(() => {
    const element = container.current;
    if (!element) return undefined;
    const map = L.map(element, {
      attributionControl: false,
      zoomControl: false,
      keyboard: true,
      maxZoom: 19,
      minZoom: 1,
      worldCopyJump: false,
    }).setView([latitude, longitude], zoom);
    L.control.zoom({ zoomInTitle: t('map.zoomIn'), zoomOutTitle: t('map.zoomOut') }).addTo(map);
    new AuthTileLayer((z, x, y, signal) => loader.current(z, x, y, signal)).addTo(map);
    L.marker([latitude, longitude], {
      keyboard: false,
      interactive: false,
      icon: L.divIcon({
        className: 'text-primary',
        html: PIN,
        iconSize: [36, 36],
        iconAnchor: [18, 34],
      }),
    }).addTo(map);
    return () => {
      map.remove();
    };
  }, [latitude, longitude, zoom, t]);

  return (
    <div
      ref={container}
      role="region"
      aria-label={label}
      className={`h-72 w-full rounded-md border border-border bg-muted ${focusRing}`}
    />
  );
}

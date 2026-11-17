import L from 'leaflet';

/** Naloži ploščico `z/x/y` prek našega strežnika (z žetonom); prekinljivo. */
export type TileLoader = (z: number, x: number, y: number, signal: AbortSignal) => Promise<Blob>;

/**
 * Plast podlage, ki ploščice nalaga z `authFetch` (016, research R-09): brskalnik ne kliče strežnika ploščic, ampak
 * `/api/map-tiles/…` z žetonom in sliko prikaže kot `blob:` URL. Ob odstranitvi ploščice se zahtevek prekine in URL
 * sprosti. Ploščice zunaj sveta (`noWrap`) se ne zahtevajo.
 */
export class AuthTileLayer extends L.GridLayer {
  private readonly loader: TileLoader;
  private readonly pending = new Map<HTMLElement, AbortController>();

  constructor(loader: TileLoader, options?: L.GridLayerOptions) {
    super({ tileSize: 256, maxZoom: 19, noWrap: true, ...options });
    this.loader = loader;
    this.on('tileunload', (event: L.TileEvent) => this.release(event.tile));
    this.on('remove', () => {
      for (const tile of [...this.pending.keys()]) this.release(tile);
    });
  }

  override createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('img');
    tile.alt = '';
    tile.setAttribute('role', 'presentation');
    const controller = new AbortController();
    this.pending.set(tile, controller);
    this.loader(coords.z, coords.x, coords.y, controller.signal).then(
      (blob) => {
        if (controller.signal.aborted) return;
        tile.onload = () => done(undefined, tile);
        tile.onerror = () => done(new Error('tile'), tile);
        tile.src = URL.createObjectURL(blob);
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          done(error instanceof Error ? error : new Error('tile'), tile);
        }
      },
    );
    return tile;
  }

  /** Prekine nalaganje in sprosti `blob:` URL ploščice. */
  private release(tile: HTMLElement) {
    this.pending.get(tile)?.abort();
    this.pending.delete(tile);
    if (tile instanceof HTMLImageElement && tile.src.startsWith('blob:')) {
      URL.revokeObjectURL(tile.src);
      tile.removeAttribute('src');
    }
  }
}

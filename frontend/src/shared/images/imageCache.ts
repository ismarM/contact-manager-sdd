// Predpomnilnik zasebnih slik (docs/specs/018-slike/research.md R-05, plan.md dopolnitev 4): slika se prenese z ID žetonom,
// v pomnilniku pa je po ključu `pot + revizija`. Blob URL obstaja samo, dokler ga kdo uporablja (štetje referenc):
// nastane ob prvi uporabi, `URL.revokeObjectURL` se pokliče ob zadnji odmontaži, izrivu in `clear()`.

export const DEFAULT_LIMIT = 200;

interface Entry {
  key: string;
  path: string;
  blob: Blob;
  url: string | null;
  refs: number;
  /** Vnos je odstranjen (izriv, `clear`, izguba dostopa): stari ročaji ne smejo več spreminjati stanja. */
  dead: boolean;
}

/** Ročaj uporabnika slike; `release` je idempotenten. */
export interface ImageHandle {
  readonly url: string;
  release(): void;
}

export class ImageCache {
  /** Vrstni red vstavljanja = vrstni red uporabe (LRU: najstarejši je prvi). */
  private readonly entries = new Map<string, Entry>();
  private readonly loading = new Map<string, Promise<Entry>>();
  private generation = 0;

  constructor(private readonly limit = DEFAULT_LIMIT) {}

  /**
   * Vrne ročaj z blob URL-jem za ključ; vsebino prenese `load` samo, če je ni v pomnilniku (hkratne zahteve za isti
   * ključ se združijo). Zavrne, če `load` zavrne ali je bil predpomnilnik medtem izpraznjen.
   */
  async acquire(key: string, path: string, load: () => Promise<Blob>): Promise<ImageHandle> {
    let entry = this.entries.get(key);
    if (!entry) {
      let pending = this.loading.get(key);
      if (!pending) {
        const generation = this.generation;
        pending = load().then((blob) => {
          if (generation !== this.generation) throw new Error('image cache cleared');
          const created: Entry = { key, path, blob, url: null, refs: 0, dead: false };
          this.entries.set(key, created);
          return created;
        });
        this.loading.set(key, pending);
        const forget = () => {
          if (this.loading.get(key) === pending) this.loading.delete(key);
        };
        pending.then(forget, forget);
      }
      entry = await pending;
    }
    if (entry.dead) throw new Error('image cache entry removed');
    return this.hold(entry);
  }

  private hold(entry: Entry): ImageHandle {
    // Uporaba osveži mesto v vrstnem redu izrivanja.
    this.entries.delete(entry.key);
    this.entries.set(entry.key, entry);
    entry.url ??= URL.createObjectURL(entry.blob);
    entry.refs += 1;
    this.evict();
    let released = false;
    const url = entry.url;
    return {
      url,
      release: () => {
        if (released) return;
        released = true;
        if (entry.dead) return;
        entry.refs -= 1;
        if (entry.refs === 0) this.revoke(entry);
      },
    };
  }

  private revoke(entry: Entry) {
    if (entry.url !== null) URL.revokeObjectURL(entry.url);
    entry.url = null;
  }

  private drop(entry: Entry) {
    entry.dead = true;
    this.revoke(entry);
    this.entries.delete(entry.key);
  }

  /** Izriv najstarejših vnosov, ki jih nihče ne uporablja, dokler število ne preseže meje. */
  private evict() {
    if (this.entries.size <= this.limit) return;
    for (const entry of [...this.entries.values()]) {
      if (this.entries.size <= this.limit) return;
      if (entry.refs === 0) this.drop(entry);
    }
  }

  /** Izguba dostopa (401/403/404): vnos izgine, prikaže se nadomestek. */
  remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.drop(entry);
  }

  /** Skupina ni več na seznamu: izbrišejo se vse slike te skupine (skupine, članov, kontaktov). */
  clearGroup(groupId: string) {
    const prefix = `/groups/${groupId}/`;
    for (const entry of [...this.entries.values()]) {
      if (entry.path.startsWith(prefix)) this.drop(entry);
    }
  }

  /** Odjava, izguba seje, zamenjava uporabnika: nobenega blob URL-ja ne sme ostati. Tekoči prenosi se zavržejo. */
  clear() {
    this.generation += 1;
    this.loading.clear();
    for (const entry of [...this.entries.values()]) this.drop(entry);
  }

  /** Število vnosov v pomnilniku (za teste). */
  get size() {
    return this.entries.size;
  }
}

export const imageCache = new ImageCache();

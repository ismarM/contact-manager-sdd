import { describe, expect, it } from 'vitest';

import { trackBlobUrls } from '../../test/imagesApi';
import { ImageCache } from './imageCache';

const blob = () => Promise.resolve(new Blob(['x'], { type: 'image/png' }));
const key = (n: number) => `/groups/g1/photo?size=96&v=${n}`;
const path = '/groups/g1/photo';

describe('ImageCache – štetje referenc in blob URL-ji', () => {
  it('vsak createObjectURL dobi svoj revokeObjectURL: ob zadnji sprostitvi, ne prej', async () => {
    const urls = trackBlobUrls();
    const cache = new ImageCache();

    const first = await cache.acquire(key(1), path, blob);
    const second = await cache.acquire(key(1), path, blob);
    expect(second.url).toBe(first.url);
    expect(urls.created).toBe(1);

    first.release();
    first.release(); // idempotentno
    expect(urls.revoked).toBe(0);
    second.release();
    expect(urls.revoked).toBe(1);
    expect(urls.active()).toEqual([]);
  });

  it('združi hkratne prenose istega ključa v en prenos', async () => {
    trackBlobUrls();
    const cache = new ImageCache();
    let loads = 0;
    const load = () => {
      loads += 1;
      return blob();
    };

    const [a, b] = await Promise.all([
      cache.acquire(key(1), path, load),
      cache.acquire(key(1), path, load),
    ]);
    expect(loads).toBe(1);
    a.release();
    b.release();
  });

  it('po sprostitvi vsebino obdrži (brez novega prenosa) in blob URL ustvari znova', async () => {
    const urls = trackBlobUrls();
    const cache = new ImageCache();
    let loads = 0;
    const load = () => {
      loads += 1;
      return blob();
    };

    (await cache.acquire(key(1), path, load)).release();
    (await cache.acquire(key(1), path, load)).release();

    expect(loads).toBe(1);
    expect(urls.created).toBe(2);
    expect(urls.revoked).toBe(2);
  });

  it('LRU: ob preseženi meji izrine najstarejše nesproščene vnose; uporabljenih ne izrine', async () => {
    const urls = trackBlobUrls();
    const cache = new ImageCache(2);

    const held = await cache.acquire(key(1), path, blob);
    (await cache.acquire(key(2), path, blob)).release();
    (await cache.acquire(key(3), path, blob)).release();
    // Meja 2: vnos 2 je najstarejši nesproščen in je izrinjen, vnos 1 se uporablja.
    expect(cache.size).toBe(2);

    let loads = 0;
    (
      await cache.acquire(key(2), path, () => {
        loads += 1;
        return blob();
      })
    ).release();
    expect(loads).toBe(1);

    held.release();
    expect(urls.created).toBe(urls.revoked + urls.active().length);
    expect(urls.active()).toEqual([]);
  });

  it('clear() prekliče vse aktivne blob URL-je, stari ročaji ne spremenijo stanja, tekoči prenosi se zavržejo', async () => {
    const urls = trackBlobUrls();
    const cache = new ImageCache();
    const a = await cache.acquire(key(1), path, blob);
    const b = await cache.acquire(key(2), path, blob);
    expect(urls.active()).toHaveLength(2);

    let finish: (value: Blob) => void = () => undefined;
    const inFlight = cache.acquire(key(3), path, () => new Promise<Blob>((r) => (finish = r)));

    cache.clear();
    expect(urls.active()).toEqual([]);
    expect(cache.size).toBe(0);

    a.release();
    b.release();
    expect(urls.revoked).toBe(2);

    finish(new Blob(['x']));
    await expect(inFlight).rejects.toThrow();
    expect(urls.created).toBe(2);
    expect(urls.created).toBe(urls.revoked);
  });

  it('remove() odstrani en vnos, clearGroup() vse vnose skupine', async () => {
    const urls = trackBlobUrls();
    const cache = new ImageCache();
    await cache.acquire(key(1), path, blob);
    await cache.acquire('/groups/g2/photo?size=96&v=1', '/groups/g2/photo', blob);
    await cache.acquire(
      '/groups/g1/contacts/c1/photo?size=96&v=1',
      '/groups/g1/contacts/c1/photo',
      blob,
    );
    await cache.acquire('/me/photo?size=96&v=1', '/me/photo', blob);

    cache.clearGroup('g1');
    expect(cache.size).toBe(2);
    cache.remove('/me/photo?size=96&v=1');
    expect(cache.size).toBe(1);
    expect(urls.active()).toHaveLength(1);

    cache.clear();
    expect(urls.active()).toEqual([]);
    expect(urls.created).toBe(urls.revoked);
  });
});

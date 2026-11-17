import { expect, type Page } from '@playwright/test';

// Slike za E2E (018): male prave slike (JPEG, PNG, PNG s prosojnostjo) in pomočniki za dialog nalaganja. Imena
// elementov so iz prevodov (slovenščina), kot drugje v E2E.

export interface TestFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

const file = (name: string, mimeType: string, base64: string): TestFile => ({
  name,
  mimeType,
  buffer: Buffer.from(base64, 'base64'),
});

export const JPEG = file(
  'portret.jpg',
  'image/jpeg',
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAB4AKADASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAIF/8QAFRABAQAAAAAAAAAAAAAAAAAAABH/xAAYAQEBAQEBAAAAAAAAAAAAAAAAAwQFBv/EABYRAQEBAAAAAAAAAAAAAAAAAAAREv/aAAwDAQACEQMRAD8AxKVNK5Mez0qlTSkNKpU0pDSqVNKQ0qlTSkNKpU0pDSqVNKQ0qlTSkNKpU0pDSqVNKQ0mlTSqxm0qlTSkNKpU0pDSqVNKQ0qlTSkNKpU0pDSqVNKQ0qlTSkNKpU0pDSqVNKQ0mlTSqRn0qlTSkNKpU0pDSqVNKQ0qlTSkNKpU0pDSqVNKQ0qlTSkNKpU0pDSqVNKQ0mlTSqxm0qlTSkNKpU0pDSqVNKQ0qlTSkNKpU0pDSqVNKQ0qlTSkNKpU0pDSqVNKQ0mlTSqRn0qlTSkNKpU0pDSqVNKQ0qlTSkNKpU0pDSqVNKQ0qlTSkNKpU0pDSqVNKQ0mlTSqxm0qlTSkNKpU0pDSqVNKQ0qlTSkNKpU0pDSqVNKQ0qlTSkNKpU0pDSqVNKQ0mlTSqRn0qlTSkNKpU0pDSqVNKQ0qlTSkNKpU0pDSqVNKQ0qlTSkNKpU0pDSqVNKQ0mlBSIUpQIUpQIUpQIUpQIUpQIUpQIUpQIUpQIUpQIV//9k=',
);
export const PNG = file(
  'portret.png',
  'image/png',
  'iVBORw0KGgoAAAANSUhEUgAAAHgAAACgEAIAAAAY++OEAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRP///////wlY99wAAAAHdElNRQfqCxAUODqWfpovAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTExLTE2VDIwOjU2OjU4KzAwOjAw/vd9YAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0xMS0xNlQyMDo1Njo1OCswMDowMI+qxdwAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMTEtMTZUMjA6NTY6NTgrMDA6MDDYv+QDAAAC10lEQVR42u3dwandVhSF4bvFnpt46lHwA3eQEiRwFW4kKclN5PWQHkIguAJ7oBYuXPj5vgo0EIutc9Y5mi9fvn//9u0BCTvX4+3nn69+DHiOnfPx+eGFJmLnGglNxh4SmhAzNClmaFL2uB5vP/969WPAc0hoUszQpOyc8yahqdjjenyW0FTsnA8JTcaOhCZkDwlNiIQmxQxNirYdKdp2pNgpJOXucignESGhSTFDkyKhSdk5R0KTcZ9Y8UITYaeQFF0OUiQ0KU6skCKhSTFDk+LUNylmaFJ2TleB0bFz+SikY4/TyEGHhCZlR0ITsnNZtqPDDE2KGZqUex3aC03EzuWQLB17SGhCJDQpO6fLGunY43IVGB1WOUgxQ5MioUnZw04hIdp2pGjbkaJtR4q2HSlmaFIkNClmaFIkNCl32045iQhdDlKcWCFFQpOibUfKfWLFC02EhCbFOjQpO+fYKSTDiRVStO1IMUOTIqFJuWdo5SQiJDQpTn2Tom1Hyo5/fROyc1q2o0NCk7KHhCZEQpOyc1q2o2MPCU2IVQ5Sdi4bK3TsnA7J0rHH9XAVGBkSmpSdy6+R6ZDQpNwztBeaCAlNinVoUrTtSNG2I0XbjhQJTYoZmhQJTcrdh1ZOIsI6NCl72CkkREKTsnOOhCZD244UbTtSzNCkSGhSzNCkuDmJlJ3Lr5HpkNCk3LePKicRIaFJ0YcmxYkVUiQ0KU59k6LLQYoTK6RIaFJ2Th+FdOxxWbajQ0KTsnNZtqNj5/RbNzr2uCzb0XEntBeaiB0JTYiEJsUMTcrO6dfIdJihSdnDDE3Iji4HIbocpEhoUvaQ0IRIaFJ2znEVGBkSmhQzNCkSmhRtO1K07UiR0KTsXH6NTIeEJsUMTYqEJsU6NCl2CkmZf7/+/f/H31/9GPAcd9tOQhMx//3z/sdvn179GPAcZmhSrHKQ4tQ3KfPjx/v7hw+vfgx4jl/DtuzLFmRbcQAAAABJRU5ErkJggg==',
);
export const PNG_ALPHA = file(
  'znak.png',
  'image/png',
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAA5UExURQAAAI5ErY5ErY5ErY5ErY5ErY5ErY5ErY5ErY5ErY5ErY5ErY5ErY5ErY5ErY5ErY5ErY5ErY5ErQnHP4AAAAASdFJOUwAFIk+DtNz2C0qXH6wGfClUdlicox4AAAAHdElNRQfqCxAUODqWfpovAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTExLTE2VDIwOjU2OjU4KzAwOjAw/vd9YAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0xMS0xNlQyMDo1Njo1OCswMDowMI+qxdwAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMTEtMTZUMjA6NTY6NTgrMDA6MDDYv+QDAAABFUlEQVRYw+2XyRKDIBBEBUHE3f7/j01MlWsCwnQuqUrfX4vMwkxR/BWW0qWxlYOrrCm1yqRrb3GW9XU6rht8UqPT8LZDSF17j/cDYhr6G350iMuNUX7CvaYIPyfwwBzkTRIPGOr74TOk/H/sHsYMHniPRX8Xv7PcWz4MWfwzo675m8kDl6zusg26E6+zeeBUm43AoDnwtYAHDh3Giwz8bmBFBnbjlYgHFBODRVscSqFBmdsHrjLcHR5usRIaVKtBXiXvcquBkAe+dgL6Dugo0HlAZ6IWGmy1QFcj3Q/4jkT3RLor8+8C/TLxbyP9OvPzAT2h8DMSP6XxcyI/qfKzMj+t8/tCQW8si8idaRG5tb3E7Y2/pAfBwbHDFF4ZcQAAAABJRU5ErkJggg==',
);
/** Besedilo s končnico slike: strežnik in brskalnik ga zavrneta kot neveljavno sliko. */
export const NOT_AN_IMAGE = file(
  'ni-slika.png',
  'image/png',
  Buffer.from('to ni slika').toString('base64'),
);

/** Dialog nalaganja slike (naslov dialoga je »Slika« ali naslov razdelka). */
export const uploadDialog = (page: Page) => page.getByRole('dialog');

/** Izbere datoteko v odprtem dialogu; ob veljavni sliki se pokaže obrezovalnik. */
export async function chooseFile(page: Page, testFile: TestFile): Promise<void> {
  await uploadDialog(page).getByLabel('Izberi datoteko').setInputFiles(testFile);
}

/** Obrezovalnik: premik in povečava s tipkovnico (puščice, +), nato *Shrani sliko*. */
export async function cropWithKeyboardAndSave(page: Page): Promise<void> {
  const dialog = uploadDialog(page);
  const crop = dialog.getByRole('button', { name: 'Obrezovanje slike' });
  await expect(crop).toBeFocused();
  await page.keyboard.press('+');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await dialog.getByRole('button', { name: 'Shrani sliko' }).click();
}

/** Odpre dialog z gumbom (npr. *Naloži sliko*), izbere datoteko, obreže s tipkovnico in shrani; počaka na zaprtje. */
export async function uploadPhoto(page: Page, openButton: string, testFile: TestFile) {
  await page.getByRole('button', { name: openButton, exact: true }).click();
  await expect(uploadDialog(page)).toBeVisible();
  await chooseFile(page, testFile);
  await cropWithKeyboardAndSave(page);
  await expect(uploadDialog(page)).toHaveCount(0);
}

/** Odstrani sliko prek potrditvenega dialoga. */
export async function removePhoto(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Odstrani sliko', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Odstranim sliko?' });
  await expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Odstrani sliko' }).click();
  await expect(dialog).toHaveCount(0);
}

/** Počaka na uspešen prenos slike z dano potjo (npr. `/api/me/photo`) – avatar je izrisan s sliko. */
export function photoLoaded(page: Page, pathPart: string) {
  return page.waitForResponse(
    (response) =>
      response.url().includes(pathPart) &&
      response.request().method() === 'GET' &&
      response.status() === 200 &&
      (response.headers()['content-type'] ?? '').startsWith('image/'),
  );
}

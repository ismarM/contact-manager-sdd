import { type CropState, exportRect, type Size } from './cropMath';

// Branje in izvoz slike v brskalniku (FR-018-14): `createImageBitmap` z `imageOrientation: 'from-image'` upošteva EXIF
// in prebere tudi WebP; izvoz je JPEG ali, če je v izrezu kaj prosojnega, PNG (največ 1024 točk).

export type DecodedImage = ImageBitmap;

export async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap !== 'function') throw new Error('createImageBitmap ni na voljo');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  if (bitmap.width < 1 || bitmap.height < 1) {
    bitmap.close();
    throw new Error('prazna slika');
  }
  return bitmap;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('izvoz slike ni uspel'))),
      type,
      quality,
    );
  });
}

function hasTransparency(context: CanvasRenderingContext2D, size: number): boolean {
  const { data } = context.getImageData(0, 0, size, size);
  for (let i = 3; i < data.length; i += 4) {
    if ((data[i] ?? 255) < 255) return true;
  }
  return false;
}

/** Izreže kvadrat po `crop` v okvirju `frame` in ga izvozi kot JPEG (PNG pri prosojnosti). */
export async function exportCrop(
  image: DecodedImage,
  crop: CropState,
  frame: number,
): Promise<Blob> {
  const size: Size = { width: image.width, height: image.height };
  const { sx, sy, side, output } = exportRect(crop, size, frame);
  const canvas = document.createElement('canvas');
  canvas.width = output;
  canvas.height = output;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('platno ni na voljo');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, sx, sy, side, side, 0, 0, output, output);
  return hasTransparency(context, output)
    ? toBlob(canvas, 'image/png')
    : toBlob(canvas, 'image/jpeg', 0.9);
}

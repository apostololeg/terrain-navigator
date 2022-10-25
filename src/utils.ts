import {
  HI_POLY_DIST,
  tileImageSize,
  tileSizeInMeters,
  yAmplitude,
  yOffset,
} from './constants';

export async function blobToImageData(blob) {
  let blobUrl = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image(tileImageSize, tileImageSize);

    img.onload = () => resolve(img);
    img.onerror = err => reject(err);
    img.src = blobUrl;
  }).then((img: HTMLImageElement) => {
    URL.revokeObjectURL(blobUrl);
    const canvas = document.createElement('canvas');
    canvas.width = tileImageSize;
    canvas.height = tileImageSize;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, tileImageSize, tileImageSize); // some browsers synchronously decode image here
  });
}

export function imageToHeightData(imageData: ImageData): number[] {
  const { data, width, height } = imageData;
  const heightData = new Array(width * height);

  for (let i = 0; i < data.length; i += 4) {
    const R = data[i];
    const G = data[i + 1];
    const B = data[i + 2];
    const height = (R * 256 * 256 + G * 256 + B) * yAmplitude - yOffset;

    heightData[i / 4] = Math.floor(height);
  }

  return heightData;
}

export function setVerticesData(geometry, data) {
  const vertices = geometry.attributes.position.array;
  const sideSize = Math.sqrt(data.length);
  let lastIndex;
  let i = 0;

  for (let x = 0; x < sideSize; x++) {
    for (let y = 0; y < sideSize; y++) {
      lastIndex = x * sideSize + y;
      const height = data[lastIndex];
      vertices[i * 3 + 2] = height;
      i++;
    }
  }

  console.log(`sideSize=${sideSize} lastIndex=${lastIndex} \n\n`);
}

export const halfTileSizeInMeters = tileSizeInMeters / 2;

const isTileNearByCoord = (c, tc) => {
  return (
    c > tc - halfTileSizeInMeters - HI_POLY_DIST &&
    c < tc + halfTileSizeInMeters + HI_POLY_DIST
  );
};

export function isTileNear(x, z, tx, tz) {
  return isTileNearByCoord(x, tx) && isTileNearByCoord(z, tz);
}

export function shiftArr(arr, delta, newItem) {
  let oldItem;

  if (delta > 0) {
    oldItem = arr[0];
    arr.shift();
    arr.push(newItem);
  } else {
    oldItem = arr[2];
    arr.pop();
    arr.unshift(newItem);
  }

  return oldItem;
}

import { Vector2 } from 'three';
import { yAmplitude, yOffset, SIDE, Side, TILE_IMAGE_SIZE } from './constants';

export async function blobToImageData(blob) {
  let blobUrl = URL.createObjectURL(blob);
  const size = TILE_IMAGE_SIZE;

  return new Promise((resolve, reject) => {
    const img = new Image(size, size);

    img.onload = () => resolve(img);
    img.onerror = err => reject(err);
    img.src = blobUrl;
  }).then((img: HTMLImageElement) => {
    URL.revokeObjectURL(blobUrl);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, size, size); // some browsers synchronously decode image here
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

    heightData[i / 4] = +height.toFixed(2);
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

  // console.log(`sideSize=${sideSize} lastIndex=${lastIndex} \n\n`);
}

export function getClosestCorner(p1, p2, halfTileSizeInMeters): Side {
  const leftX = p1.x - halfTileSizeInMeters;
  const rightX = p1.x + halfTileSizeInMeters;
  const topZ = p1.z - halfTileSizeInMeters;
  const bottomZ = p1.z + halfTileSizeInMeters;
  const point = new Vector2(p2.x, p2.z);
  const distances = {
    [SIDE.TOP_LEFT]: point.distanceToSquared(new Vector2(leftX, topZ)),
    [SIDE.TOP_RIGHT]: point.distanceToSquared(new Vector2(rightX, topZ)),
    [SIDE.BOTTOM_LEFT]: point.distanceToSquared(new Vector2(leftX, bottomZ)),
    [SIDE.BOTTOM_RIGHT]: point.distanceToSquared(new Vector2(rightX, bottomZ)),
  };

  // @ts-ignore
  const [side] = Object.entries(distances).sort((a, b) => a[1] - b[1])[0];

  return side;
}

export function shiftArr(arr: any[], delta, newItem) {
  let oldItem;

  if (delta > 0) {
    oldItem = arr.shift();
    arr.push(newItem);
  } else {
    oldItem = arr.pop();
    arr.unshift(newItem);
  }

  return oldItem;
}

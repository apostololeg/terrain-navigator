import Dexie from 'dexie';
import resizeImageData from 'resize-image-data';

import { tileImageSize } from './constants';
import { blobToImageData, imageToHeightData } from './utils';

export type HeightData = number[];

const _ = (...args) => args.join('_');
const db = new Dexie('heightmap');

db.version(1).stores({
  height: 'slug,data',
  image: 'slug,data',
});

const init = db.open();

export default class Tiles {
  params;

  constructor(params) {
    this.params = params;
  }

  async getTile(x, z, zoom, size: number): Promise<HeightData> {
    await init;

    let slug = _(x, z, zoom, size);
    let item = await db.table('height').get({ slug });
    let data = item?.data;

    if (!data) {
      const imageData = await this.getImageData(x, z, zoom, size);
      data = imageToHeightData(imageData as ImageData);
      db.table('height').put({ slug, data });
    }

    return data;
  }

  async getImageData(x, z, zoom, size = tileImageSize) {
    const imageData = await this.loadImageData(x, z, zoom);

    return size !== tileImageSize
      ? resizeImageData(imageData, size, size)
      : imageData;
  }

  buildTileURL = (x, y, zoom, tileset) => {
    const token = this.params.mapBoxToken;
    return `https://api.mapbox.com/v4/mapbox.${tileset}/${zoom}/${x}/${y}.pngraw?access_token=${token}`;
  };

  async loadImageData(x, z, zoom): Promise<ImageData> {
    const cache = await db.table('image').get({ slug: _(x, z, zoom) });
    if (cache) return cache.data;

    const url = this.buildTileURL(x, z, zoom, 'terrain-rgb');
    const res = await fetch(url);
    const blob = await res.blob();
    const data = await blobToImageData(blob);
    const slug = _(x, z, zoom);

    db.table('image').put({ slug, data });

    return data;
  }
}

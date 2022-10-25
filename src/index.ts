import {
  Mesh,
  Object3D,
  Matrix4,
  Group,
  Vector3,
  Raycaster,
  Material,
  PlaneGeometry,
} from 'three';
import SphericalMercator from '@mapbox/sphericalmercator';

import {
  AROUND_TILES_POS,
  tileImageSize,
  tileSizeInMeters,
  ZOOM,
  SCALE,
  TILE_DELTA_BY_SIDE,
  SIDE_BY_DELTA,
  TILE_SEAMS,
  SEAM_TILES,
} from './constants';
import type { Side } from './constants';
import {
  halfTileSizeInMeters,
  isTileNear,
  setVerticesData,
  shiftArr,
} from './utils';
import Tiles from './tiles';
import type { HeightData } from './tiles';
import seamTiles from './seam';

type TileState = {
  side?: Side;
  size?: number;
  scale: number;
  x?: number;
  z?: number;
  heightData?: HeightData;
  geometry: { [scale: string]: PlaneGeometry };
  currentGeometry?: PlaneGeometry;
  object?: Object3D;
  isNear?: boolean;
};

const _t = (): TileState => ({
  geometry: {},
  scale: 0,
});

type Coords = { lat: number; lon: number };

export type TerrainParams = {
  mapBoxToken: string;
  container: Object3D;
  material: Material;
  coords?: Coords;
  position?: number[]; // [x,z]
  getPosition: () => Vector3;
  setPosition: (position: Partial<Vector3>) => void;
  onTileRebuilded?: (tile: TileState, oldObject?: Object3D) => void;
};

export default class Terrain {
  params: TerrainParams;
  container = new Group();
  merc = new SphericalMercator({
    size: tileImageSize,
    // antimeridian: true,
  });

  inited = false;
  offset = { x: 0, z: 0 };
  position = { x: 0, z: 0 }; // observer position with offset
  coords = { lat: 0, lon: 0 };
  tileNumber = { x: 0, z: 0 };
  tilesStore;
  tiles = [
    [_t(), _t(), _t()],
    [_t(), _t(), _t()],
    [_t(), _t(), _t()],
  ];
  rebuildId;
  rebuildPromises: { [side: Side]: Promise<void> } = {}; // [side]: Promise<void>
  rebuildSeams: { [side: Side]: true } = {}; // [seam position]: true

  constructor(params: TerrainParams) {
    const { coords, position, mapBoxToken } = params;

    this.params = params;
    this.coords = coords;
    this.tilesStore = new Tiles({ mapBoxToken });

    if (position) {
      const [lon, lat] = this.merc.ll(position, ZOOM);
      this.coords = { lat, lon };
    }

    if (!this.coords) {
      throw new Error('coords or position is required');
    }
  }

  async start() {
    this.updateHorizontalPosition();
    await this.update();
    this.updateVerticalPosition();
    this.inited = true;
  }

  updateHorizontalPosition() {
    const { lat, lon } = this.coords;
    const [x, z] = this.merc.px([lon, lat], ZOOM);

    // offset fix objects shaking when camera moves
    // https://discourse.threejs.org/t/moving-the-camera-model-will-shake-if-the-coordinates-are-large/7214
    this.offset = { x, z };
    this.params.setPosition({ x: 0, z: 0 });
  }

  updateVerticalPosition() {
    const centralTile = this.tiles[1][1].object;
    const ray = new Raycaster(new Vector3(0, 10000, 0), new Vector3(0, -1, 0));
    const intersectObj = ray.intersectObject(centralTile)[0];
    const yPos = intersectObj?.point.y;

    if (Number.isFinite(yPos)) this.params.setPosition({ y: yPos });
  }

  shift() {
    const { x, z } = this.position;
    const [nx, nz] = [
      Math.floor(x / tileImageSize),
      Math.floor(z / tileImageSize),
    ];
    let dx = 0;
    let dz = 0;

    if (this.inited && (this.tileNumber.x !== nx || this.tileNumber.z !== z)) {
      dx = nx - this.tileNumber.x;
      dz = nz - this.tileNumber.z;
    }

    this.tileNumber = { x: nx, z: nz };

    // counting that dx and dz are always 1 or -1

    if (dx) {
      this.tiles.forEach(xRow => {
        const oldTile = shiftArr(xRow, dx, _t());
        this.removeTile(oldTile);
      });
    }

    if (dz) {
      const newRow = [_t(), _t(), _t()];
      const oldRow = shiftArr(this.tiles, dz, newRow);

      oldRow.forEach(this.removeTile);
    }
  }

  update = () => {
    const { x, z } = this.params.getPosition();

    this.position = {
      x: x + this.offset.x,
      z: z + this.offset.z,
    };

    this.shift();
    return this.rebuild();
  };

  async rebuild() {
    this.rebuildId = Math.random();

    [[0, 0], ...AROUND_TILES_POS].forEach(([dx, dz]) => {
      const side = SIDE_BY_DELTA[`${dz},${dx}`];

      this.rebuildPromises[side] = this.rebuildTile(
        this.rebuildId,
        dx,
        dz,
        side
      );
    });

    await Promise.all(Object.values(this.rebuildPromises));
  }

  async rebuildTile(id, dx, dz, side) {
    const { x, z } = this.params.getPosition();
    const tile = this.getTileBySide(side);
    const tileNX = this.tileNumber.x + dx;
    const tileNZ = this.tileNumber.z + dz;
    // tile position
    const tx = tileNX * tileSizeInMeters - this.offset.x + halfTileSizeInMeters;
    const tz = tileNZ * tileSizeInMeters - this.offset.z + halfTileSizeInMeters;

    // const side = SIDE_BY_DELTA[dz, dx];
    const isPosChanged = tile.side !== side;

    const isNear = isTileNear(x, z, tx, tz);
    const scale = isNear ? SCALE[0] : SCALE[1];

    if (isPosChanged || tile.scale !== scale) {
      console.log(`${x}:${z}\t${tx}:${tz}\t${scale}`);

      tile.isNear = isNear;
      tile.side = side;
      tile.scale = scale;
      tile.size = tileImageSize * scale + 1;
      tile.x = tx;
      tile.z = tz;
      tile.heightData = await this.tilesStore.getTile(
        tileNX,
        tileNZ,
        ZOOM,
        tile.size
      );

      if (id !== this.rebuildId) return;

      tile.geometry[scale] = this.buildTileGeometry(tile);
      tile.currentGeometry = tile.geometry[scale];

      const oldObject = tile.object;

      this.removeTile(tile);
      tile.object = new Mesh(
        tile.currentGeometry,
        this.params.material.clone()
      );
      // tile.object.material.color = new Color(colors[dx + 1][dz + 1]);
      tile.object.receiveShadow = true;
      tile.object.castShadow = true;

      TILE_SEAMS[side].forEach(seam => this.seam(id, seam));

      this.params.onTileRebuilded(tile, oldObject);
    }
  }

  buildTileGeometry({ x, z, heightData }: TileState) {
    const segmentCount = Math.sqrt(heightData.length) - 1;
    const geometry = new PlaneGeometry(
      tileSizeInMeters,
      tileSizeInMeters,
      segmentCount,
      segmentCount
    );

    setVerticesData(geometry, heightData);
    geometry.applyMatrix4(new Matrix4().makeRotationX(-Math.PI / 2));
    geometry.applyMatrix4(new Matrix4().makeTranslation(x, 0, z));
    geometry.computeVertexNormals();

    return geometry;
  }

  removeTile = (tile: TileState) => {
    if (tile.object) {
      this.params.container.remove(tile.object);
      tile.object = null;
    }
  };

  getTileBySide = (side: Side) => {
    const [dx, dz] = TILE_DELTA_BY_SIDE[side];
    return this.tiles[dz + 1][dx + 1];
  };

  async seam(id, seam) {
    if (this.rebuildSeams[seam]) return;

    this.rebuildSeams[seam] = true;

    const tilesSides = SEAM_TILES[seam];

    // await for tiles (that adjacent to this seam) to rebuild
    await Promise.all(tilesSides.map(side => this.rebuildPromises[side]));

    if (id !== this.rebuildId) return;

    const [tileA, tileB] = tilesSides.map(this.getTileBySide);

    seamTiles(tileA, tileB);

    delete this.rebuildSeams[seam];
  }
}

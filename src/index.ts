import {
  Mesh,
  Group,
  Object3D,
  Matrix4,
  Vector2,
  Vector3,
  Raycaster,
  Material,
  PlaneGeometry,
} from 'three';
import SphericalMercator from '@mapbox/sphericalmercator';

import {
  tileImageSize,
  tileSizeInMeters,
  TILE_DELTA_BY_SIDE,
  TILE_SIDES,
  TILE_SEAMS,
  SEAM_TILES,
} from './constants';
import type { Side } from './constants';
import {
  getClosestCorner,
  halfTileSizeInMeters,
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
  pos?: Vector2;
  heightData?: HeightData;
  geometry: PlaneGeometry;
  object?: Object3D;
  isNear?: boolean;
};

const _t = (): TileState => ({
  geometry: null,
  scale: 0,
});

type Coords = { lat: number; lon: number };

export type TerrainParams = {
  mapBoxToken: string;
  container: Object3D;
  material: Material;
  coords?: Coords;
  zoom: number;
  position?: number[]; // [x,z]
  scale?: number; // 0..1
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
  scale = 1;
  offset = { x: 0, z: 0 };
  position = { x: 0, z: 0 }; // observer position with offset
  coords = { lat: 0, lon: 0 };
  tileNumber = { x: 0, z: 0 };
  tilesStore;
  tileBySide = {}; // [side]: TileState
  tilesDeltas = {}; // [side]: [dx, dz]
  tiles = [
    [_t(), _t()],
    [_t(), _t()],
  ];
  currTileSide: string = null;
  currTile: TileState = null;
  rebuildId;
  rebuildPromises: { [side: Side]: Promise<void> } = {}; // [side]: Promise<void>
  rebuildSeams: { [side: Side]: true } = {}; // [seam position]: true

  constructor(params: TerrainParams) {
    const { coords, position, zoom, mapBoxToken } = params;

    if (params.scale) this.scale = params.scale;
    this.params = params;
    this.coords = coords;
    this.tilesStore = new Tiles({ mapBoxToken });

    if (position) {
      const [lon, lat] = this.merc.ll(position, zoom);
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
    const [x, z] = this.merc.px([lon, lat], this.params.zoom);

    // offset fix objects shaking when camera moves
    // https://discourse.threejs.org/t/moving-the-camera-model-will-shake-if-the-coordinates-are-large/7214
    this.offset = { x, z };
    this.params.setPosition({ x: 0, z: 0 });
  }

  updateVerticalPosition() {
    const ray = new Raycaster(new Vector3(0, 10000, 0), new Vector3(0, -1, 0));
    const intersectObj = ray.intersectObject(this.currTile.object)[0];
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

    if (this.inited && (this.tileNumber.x !== nx || this.tileNumber.z !== nz)) {
      dx = nx - this.tileNumber.x;
      dz = nz - this.tileNumber.z;
    }

    this.tileNumber = { x: nx, z: nz };

    // counting that dx and dz can be 0 or 1 or -1

    if (dx) {
      this.tiles.forEach(xRow => {
        const oldTile = shiftArr(xRow, dx, _t());
        this.removeTile(oldTile);
      });
    }

    if (dz) {
      const newRow = [_t(), _t()];
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

  rebuild(): Promise<void[]> {
    const id = Math.random();
    const pos = this.params.getPosition();
    const currTilePos = this.getTilePos(0, 0);
    const newSide = getClosestCorner(pos, currTilePos);

    console.log('newSide', newSide);

    if (this.currTileSide === newSide) return;

    this.rebuildId = id;
    this.currTileSide = newSide;
    this.tilesDeltas = TILE_DELTA_BY_SIDE[newSide];

    const sides = [...TILE_SIDES];
    this.tiles.flat().forEach(tile => {
      tile.side = sides.shift();
      this.tileBySide[tile.side] = tile;
    });
    this.currTile = this.tileBySide[newSide];

    // @ts-ignore
    Object.entries(this.tilesDeltas).forEach(([side, [dx, dz]]) => {
      this.rebuildPromises[side] = this.rebuildTile(id, dz, dx, side);
    });

    return Promise.all(Object.values(this.rebuildPromises));
  }

  async rebuildTile(id, dx, dz, side) {
    const { zoom, material, getPosition, onTileRebuilded } = this.params;
    const { x, z } = getPosition();
    const tile = this.tileBySide[side];
    const pos = this.getTilePos(dx, dz);
    const size = tileImageSize * this.scale + 1;

    console.log(`${x}:${z}\t${pos.x}:${pos.z}`);

    tile.heightData = await this.tilesStore.getTile(pos.nx, pos.nz, zoom, size);

    if (id !== this.rebuildId) return;

    const geometry = this.buildTileGeometry(pos, tile.heightData);
    const oldObject = tile.object;

    this.removeTile(tile);
    tile.object = new Mesh(geometry, material.clone());
    tile.object.receiveShadow = true;
    tile.object.castShadow = true;

    TILE_SEAMS[side].forEach(seam => this.seam(id, seam));

    onTileRebuilded(tile, oldObject);
  }

  buildTileGeometry(pos, heightData) {
    const segmentCount = Math.sqrt(heightData.length) - 1;
    const geometry = new PlaneGeometry(
      tileSizeInMeters,
      tileSizeInMeters,
      segmentCount,
      segmentCount
    );

    setVerticesData(geometry, heightData);
    geometry.applyMatrix4(new Matrix4().makeRotationX(-Math.PI / 2));
    geometry.applyMatrix4(new Matrix4().makeTranslation(pos.x, 0, pos.z));
    geometry.computeVertexNormals();

    return geometry;
  }

  removeTile = (tile: TileState) => {
    if (tile.object) {
      this.params.container.remove(tile.object);
      tile.object = null;
    }
  };

  getTilePos(dx, dz) {
    const nx = this.tileNumber.x + dx;
    const nz = this.tileNumber.z + dz;

    return {
      nx,
      nz,
      x: nx * tileSizeInMeters - this.offset.x + halfTileSizeInMeters,
      z: nz * tileSizeInMeters - this.offset.z + halfTileSizeInMeters,
    };
  }

  async seam(id, seam) {
    if (this.rebuildSeams[seam]) return;

    this.rebuildSeams[seam] = true;

    const tilesSides = SEAM_TILES[seam];

    // await for tiles (that adjacent to this seam) to rebuild
    await Promise.all(tilesSides.map(side => this.rebuildPromises[side]));

    if (id !== this.rebuildId) return;

    const [tileA, tileB] = tilesSides.map(side => this.tileBySide[side]);

    console.log('seam', seam, '|', tileA.side, tileB.side);
    seamTiles(tileA, tileB);

    delete this.rebuildSeams[seam];
  }
}

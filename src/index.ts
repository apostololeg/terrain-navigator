import {
  Mesh,
  Box3,
  Group,
  Object3D,
  Matrix4,
  Vector2,
  Vector3,
  Raycaster,
  Material,
  PlaneGeometry,
  BoxGeometry,
} from 'three';
import { CSG } from 'three-csg-ts';
import SphericalMercator from '@mapbox/sphericalmercator';

import {
  TILE_IMAGE_SIZE,
  TILE_IMAGE_SIZE_IN_METERS,
  TILE_DELTA_BY_SIDE,
  TILE_SIDES,
  TILE_SEAMS,
  SEAM_TILES,
} from './constants';
import type { Side } from './constants';
import { getClosestCorner, setVerticesData, shiftArr } from './utils';
import Tiles from './tiles';
import type { HeightData } from './tiles';
import seamTiles from './seam';

type TilePos = {
  x: number;
  z: number;
  nx: number;
  nz: number;
};

type TileState = {
  side?: Side;
  size?: number;
  scale: number;
  pos?: TilePos;
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

type Vector2D = { x: number; z: number };

export type TerrainParams = {
  mapBoxToken: string;
  container: Object3D;
  material: Material;
  coords?: Coords;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  position?: Vector2D;
  offset: Vector2D;
  scale?: number; // 0..1
  getPosition: () => Vector3;
  setPosition: (position: Partial<Vector3>) => void;
  onTileRebuilded?: (
    levelNumber: number,
    tile: TileState,
    oldObject?: Object3D
  ) => void;
};

export default class Terrain {
  root?: Terrain;
  isRoot: boolean;
  params?: TerrainParams;

  container = new Group();
  merc = new SphericalMercator({
    size: TILE_IMAGE_SIZE,
    // antimeridian: true,
  });

  inited = false;
  scale = 1;
  zoomScale = 1;
  levelNumber = 0;
  subLevel: Terrain;
  offset = { x: 0, z: 0 };
  position = { x: 0, z: 0 }; // observer position with offset
  coords = { lat: 0, lon: 0 };
  parentLevelCenterDot: Vector2;
  material: Material;
  tileNumber = { x: 0, z: 0 };
  tileImageSize: number;
  tileSizeInMeters: number;
  halfTileSizeInMeters: number;
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

  constructor(params: TerrainParams, root?: Terrain) {
    const { coords, position, zoom, scale, material, mapBoxToken } = params;
    const minZoom = params.minZoom || zoom;

    this.isRoot = !root;
    this.root = root || this;
    this.params = params;
    if (scale) this.scale = scale;

    if (this.isRoot) {
      if (position) {
        const [lon, lat] = this.merc.ll(position, zoom);
        this.coords = { lat, lon };
      } else if (!coords) {
        throw new Error('coords or position is required');
      } else {
        this.coords = { lat: coords.lat, lon: coords.lon };
      }

      this.tilesStore = new Tiles({ mapBoxToken });
    }

    if (typeof minZoom === 'number') {
      const newZoom = zoom - 1;

      if (!this.isRoot) {
        this.zoomScale = (this.root.params.zoom - zoom) * 2;
      }

      this.tileImageSize = TILE_IMAGE_SIZE; // * this.zoomScale;
      this.tileSizeInMeters = TILE_IMAGE_SIZE_IN_METERS * this.zoomScale;
      this.halfTileSizeInMeters = this.tileSizeInMeters / 2;

      this.log('this.tileSizeInMeters', this.tileSizeInMeters);

      if (newZoom >= 0 && newZoom < minZoom) return;

      this.subLevel = new Terrain(
        {
          ...params,
          zoom: newZoom,
        },
        this.root
      );
    }
  }

  async start() {
    if (this.isRoot) this.updateHorizontalPosition();
    await this.update();
    if (this.isRoot) this.updateVerticalPosition();
    this.inited = true;
  }

  updateHorizontalPosition() {
    const { lat, lon } = this.root.coords;
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
    const { x, z } = this.root.position;
    const imageSize = this.tileImageSize * this.zoomScale;
    const nx = Math.floor(x / imageSize);
    const nz = Math.floor(z / imageSize);
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

  update = async (centerDot?: Vector2) => {
    const { x, z } = this.params.getPosition();

    if (this.isRoot) {
      const { offset } = this.root;

      this.position = {
        x: x + offset.x,
        z: z + offset.z,
      };
    }

    if (centerDot) {
      this.parentLevelCenterDot = centerDot;
    }

    this.shift();
    await this.rebuild();

    if (this.subLevel) {
      const leftTopTile = this.tiles[0][0];

      this.subLevel.update(
        new Vector2(
          leftTopTile.pos.x + this.halfTileSizeInMeters,
          leftTopTile.pos.z + this.halfTileSizeInMeters
        )
      );
    }
  };

  rebuild(): Promise<void[]> {
    const id = Math.random();
    const pos = this.params.getPosition();
    const currTilePos = this.getTilePos(0, 0);
    const newSide = getClosestCorner(
      pos,
      currTilePos,
      this.halfTileSizeInMeters
    );

    this.log('newSide', newSide);

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
    const { getPosition, onTileRebuilded } = this.params;
    const { x, z } = getPosition();
    const tile = this.tileBySide[side];
    const pos = this.getTilePos(dx, dz);
    const size = (this.root.tileImageSize / this.zoomScale) * this.scale + 1;

    this.log(`${x}:${z}\t${pos.x}:${pos.z}\t${size}`);

    tile.pos = pos;
    tile.heightData = await this.getTile(pos.nx, pos.nz, size);

    if (id !== this.rebuildId) return;

    const geometry = this.buildTileGeometry(pos, tile.heightData);
    const oldObject = tile.object;

    this.removeTile(tile);

    let object = new Mesh(geometry, this.getTileMaterial(pos));

    object.receiveShadow = true;
    object.castShadow = true;

    tile.object = object;

    TILE_SEAMS[side].forEach(seam => this.seam(id, seam));

    onTileRebuilded(this.levelNumber, tile, oldObject);
  }

  buildTileGeometry(pos: TilePos, heightData) {
    const segmentCount = Math.sqrt(heightData.length) - 1;
    const geometry = new PlaneGeometry(
      this.tileSizeInMeters,
      this.tileSizeInMeters,
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

  getTile(nx, nz, size) {
    const { zoom } = this.params;
    return (this.root || this).tilesStore.getTile(nx, nz, zoom, size);
  }

  getTilePos(dx, dz): TilePos {
    const nx = this.tileNumber.x + dx;
    const nz = this.tileNumber.z + dz;
    const { offset } = this.root;

    return {
      nx,
      nz,
      x: nx * this.tileSizeInMeters - offset.x + this.halfTileSizeInMeters,
      z: nz * this.tileSizeInMeters - offset.z + this.halfTileSizeInMeters,
    };
  }

  getTileMaterial(pos) {
    const material = this.root.params.material.clone();

    if (this.parentLevelCenterDot) {
      const tilePos = new Vector2(pos.x, pos.z);
      const dist = this.parentLevelCenterDot.add(tilePos).normalize();

      this.log('direction', dist?.length());
    }

    return material;
  }

  async seam(id, seam) {
    if (this.rebuildSeams[seam]) return;

    this.rebuildSeams[seam] = true;

    const tilesSides = SEAM_TILES[seam];

    // await for tiles (that adjacent to this seam) to rebuild
    await Promise.all(tilesSides.map(side => this.rebuildPromises[side]));

    if (id !== this.rebuildId) return;

    const [tileA, tileB] = tilesSides.map(side => this.tileBySide[side]);

    this.log('seam', seam, '|', tileA.side, tileB.side);
    seamTiles(tileA, tileB);

    delete this.rebuildSeams[seam];
  }

  log(...args) {
    console.log(`[${this.levelNumber}]`, ...args);
  }
}

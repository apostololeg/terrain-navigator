import {
  Mesh,
  Group,
  Object3D,
  Matrix4,
  Vector3,
  Raycaster,
  Material,
  PlaneGeometry,
  Plane,
} from 'three';
import SphericalMercator from '@mapbox/sphericalmercator';

import {
  TILE_IMAGE_SIZE,
  TILE_IMAGE_SIZE_IN_METERS,
  TILE_DELTA_BY_SIDE,
  TILE_SIDES,
  TILE_SEAMS,
  SEAM_TILES,
  SIDE,
} from './constants';
import type { Side } from './constants';
import { getClosestCorner, setVerticesData, shiftArr } from './utils';
import Tiles from './tiles';
import type { HeightData } from './tiles';
import { seamSameLevel, seamToPrevLevel } from './seam';

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
  material?: Material;
  clipSide?: Side;
  clippingPlanes?: Plane[];
  object?: Object3D<Mesh<PlaneGeometry, Material>>;
  isNear?: boolean;
  // needsRebuild?: boolean;
};

const _t = (): TileState => ({
  geometry: null,
  scale: 0,
  // needsRebuild: true,
});

type Coords = { lat: number; lon: number };

type Vector2D = { x: number; z: number };

export type TerrainParams = {
  mapBoxToken: string;
  container: Object3D;
  material: Material;
  coords?: Coords;
  tileImageSize?: 256 | 512;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  zoomScale?: number;
  levelNumber?: number;
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
  params?: TerrainParams;
  root?: Terrain;
  parent?: Terrain;
  isRoot: boolean;

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
  parentLevelCenterDot: number[];
  material: Material;
  tileNumber = { x: 0, z: 0 };
  tileSegmentsCount: number;
  imageSize: number;
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

  log: (...args: any[]) => void;

  constructor(params: TerrainParams, root?: Terrain, parent?: Terrain) {
    const {
      coords,
      position,
      tileImageSize,
      zoom,
      scale,
      levelNumber,
      mapBoxToken,
    } = params;
    const minZoom = params.minZoom || zoom;

    this.isRoot = !root;
    this.root = root || this;
    this.parent = parent;
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
      this.tileImageSize = tileImageSize || TILE_IMAGE_SIZE;
    }

    this.levelNumber = levelNumber ?? 0;
    this.zoomScale = Math.pow(2, this.levelNumber);
    this.imageSize = this.root.tileImageSize * this.zoomScale;
    this.tileSegmentsCount =
      (this.root.tileImageSize / (this.zoomScale / 2)) * this.scale + 1;

    this.log = console.log.bind(this, `${this.levelNumber} ::`);

    if (typeof minZoom === 'number') {
      const newZoom = zoom - 1;

      this.tileSizeInMeters = TILE_IMAGE_SIZE_IN_METERS * this.zoomScale;
      this.halfTileSizeInMeters = this.tileSizeInMeters / 2;

      if (newZoom >= minZoom) {
        const newLevelParams = {
          ...params,
          zoom: newZoom,
          levelNumber: this.levelNumber + 1,
        };

        this.subLevel = new Terrain(newLevelParams, this.root, this);
      }
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
    this.root.params.setPosition({ x: 0, z: 0 });
  }

  updateVerticalPosition() {
    const ray = new Raycaster(new Vector3(0, 10000, 0), new Vector3(0, -1, 0));
    const intersectObj = ray.intersectObject(this.currTile.object)[0];
    const yPos = intersectObj?.point.y;

    if (Number.isFinite(yPos)) this.params.setPosition({ y: yPos });
  }

  shift() {
    const { x, z } = this.root.position;
    const nx = Math.floor(x / this.imageSize);
    const nz = Math.floor(z / this.imageSize);
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

  update = async (centerDot?: number[]) => {
    this.log('centerDot', centerDot);

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
      await this.rebuildPromises['top-left'];
      const leftTopTile = this.tileBySide['top-left'];
      const centralTilePos = [
        leftTopTile.pos.x + this.halfTileSizeInMeters,
        leftTopTile.pos.z + this.halfTileSizeInMeters,
      ];

      this.subLevel.update(centralTilePos);
    }
  };

  async rebuild(): Promise<void[]> {
    const id = Math.random();
    const pos = this.params.getPosition();
    const currTilePos = this.getTilePos(0, 0);
    const newSide = getClosestCorner(
      pos,
      currTilePos,
      this.halfTileSizeInMeters
    );

    this.log('newSide', newSide);

    if (this.currTileSide === newSide) {
      this.tiles.flat().forEach(tile => {
        this.updateClipingPlanes(tile);
        // this.applyClipingPlanes(tile);
      });
      return;
    }

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

    await Promise.all(Object.values(this.rebuildPromises));

    if (!this.isRoot) requestAnimationFrame(() => this.seamToPrevLevel(id));
  }

  async rebuildTile(id, dx, dz, side) {
    const { onTileRebuilded } = this.params;
    const tile = this.tileBySide[side];
    const oldObject = tile.object;

    // if (tile.needsRebuild) {
    this.log('rebuildTile', tile.side);

    const pos = this.getTilePos(dx, dz);

    tile.pos = pos;

    this.setTileMaterial(tile);
    this.updateClipingPlanes(tile);

    tile.heightData = await this.getTile(pos.nx, pos.nz);

    if (id !== this.rebuildId) return;

    tile.geometry = this.buildTileGeometry(pos, tile.heightData);

    this.removeTile(tile);

    tile.object = new Mesh(tile.geometry, tile.material);
    tile.object.receiveShadow = true;
    tile.object.castShadow = true;

    // delete tile.needsRebuild;
    onTileRebuilded(this.levelNumber, tile, oldObject);
    // }

    TILE_SEAMS[side].forEach(seam => this.seam(id, seam));
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

  getTile(nx, nz) {
    const { zoom } = this.params;
    const size = this.tileSegmentsCount;

    return this.root.tilesStore.getTile(nx, nz, zoom, size);
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

  getClipingPlanes(tile: TileState): Plane[] {
    const { clipSide, pos } = tile;

    if (!clipSide) return [];

    switch (clipSide) {
      case SIDE.CENTER:
        switch (tile.side) {
          case SIDE.TOP_LEFT:
            return [
              new Plane(
                new Vector3(-1, 0, 0),
                -Math.abs(pos.x) - this.halfTileSizeInMeters
              ),
            ];
          case SIDE.TOP_RIGHT:
            return [
              new Plane(
                new Vector3(1, 0, 0),
                -Math.abs(pos.x) - this.halfTileSizeInMeters
              ),
            ];
          case SIDE.BOTTOM_LEFT:
            return [
              new Plane(
                new Vector3(0, 0, -1),
                -Math.abs(pos.z) - this.halfTileSizeInMeters
              ),
            ];
          case SIDE.BOTTOM_RIGHT:
            return [
              new Plane(
                new Vector3(0, 0, 1),
                -Math.abs(pos.z) - this.halfTileSizeInMeters
              ),
            ];
        }

        break;

      case SIDE.RIGHT:
        return [new Plane(new Vector3(-1, 0, 0), pos.x)];

      case SIDE.LEFT:
        return [new Plane(new Vector3(1, 0, 0), -pos.x)];

      case SIDE.BOTTOM:
        return [new Plane(new Vector3(0, 0, -1), pos.z)];

      case SIDE.TOP:
        return [new Plane(new Vector3(0, 0, 1), -pos.z)];

      case SIDE.BOTTOM_RIGHT:
        return [
          new Plane(new Vector3(-1, 0, 0), pos.x),
          new Plane(new Vector3(0, 0, -1), pos.z),
        ];

      case SIDE.BOTTOM_LEFT:
        return [
          new Plane(new Vector3(1, 0, 0), -pos.x),
          new Plane(new Vector3(0, 0, -1), pos.z),
        ];

      case SIDE.TOP_RIGHT:
        return [
          new Plane(new Vector3(-1, 0, 0), pos.x),
          new Plane(new Vector3(0, 0, 1), -pos.z),
        ];

      case SIDE.TOP_LEFT:
        return [
          new Plane(new Vector3(1, 0, 0), -pos.x),
          new Plane(new Vector3(0, 0, 1), -pos.z),
        ];
    }

    return [];
  }

  getClipSide = (tile: TileState) => {
    if (!this.parentLevelCenterDot) return null;

    const { pos } = tile;
    const [x, z] = this.parentLevelCenterDot;
    const dx = pos.x - x;
    const dz = pos.z - z;

    const sameHoriz = dx === 0;
    const sameVert = dz === 0;
    const halfToLeft = dx === -this.halfTileSizeInMeters;
    const halfToRight = dx === this.halfTileSizeInMeters;
    const halfToTop = dz === -this.halfTileSizeInMeters;
    const halfToBottom = dz === this.halfTileSizeInMeters;

    if (sameHoriz && sameVert) return SIDE.CENTER;

    if (sameVert) {
      if (halfToLeft) return SIDE.RIGHT;
      if (halfToRight) return SIDE.LEFT;
    }

    if (sameHoriz) {
      if (halfToTop) return SIDE.BOTTOM;
      if (halfToBottom) return SIDE.TOP;
    }

    if (halfToTop) {
      if (halfToLeft) return SIDE.BOTTOM_RIGHT;
      if (halfToRight) return SIDE.BOTTOM_LEFT;
    }

    if (halfToBottom) {
      if (halfToLeft) return SIDE.TOP_RIGHT;
      if (halfToRight) return SIDE.TOP_LEFT;
    }

    return null;
  };

  setTileMaterial(tile: TileState) {
    if (tile.material) return;

    tile.material = this.root.params.material.clone();
    // tile.material.clippingPlanes = tile.clippingPlanes;
    // tile.material.clipIntersection = true;
  }

  updateClipingPlanes = (tile: TileState) => {
    if (this.levelNumber === 0) return;

    tile.clipSide = this.getClipSide(tile);
    tile.clippingPlanes = this.getClipingPlanes(tile);
    this.applyClipingPlanes(tile);
    // console.log('updateClipingPlanes', tile.side, tile.clippingPlanes);
    // if (!tile.clippingPlanes) debugger;
  };

  applyClipingPlanes = (tile: TileState) => {
    if (this.levelNumber === 0) return;

    const { material, clippingPlanes } = tile;

    if (clippingPlanes) {
      material.clippingPlanes = clippingPlanes;
      material.clipIntersection = true;
    } else {
      material.clippingPlanes = [];
      material.clipIntersection = false;
    }
  };

  async seam(id, seam) {
    if (this.rebuildSeams[seam]) return;

    this.rebuildSeams[seam] = true;

    const tilesSides = SEAM_TILES[seam];

    // await for tiles (that adjacent to this seam) to rebuild
    await Promise.all(tilesSides.map(side => this.rebuildPromises[side]));

    if (id !== this.rebuildId) return;

    const [tileA, tileB] = tilesSides.map(side => this.tileBySide[side]);

    // this.log('seam', seam, '|', tileA.side, tileB.side);
    seamSameLevel(tileA, tileB);

    delete this.rebuildSeams[seam];
  }

  seamToPrevLevel(id) {
    this.tiles.flat().forEach(tile => {
      seamToPrevLevel(tile, this);
      // @ts-ignore
      requestAnimationFrame(() => tile.object.geometry.computeVertexNormals());
    });
  }
}

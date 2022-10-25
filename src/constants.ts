export const tileImageSize = 256;
export const tileSizeInMeters = tileImageSize;
export const HI_POLY_DIST = 0.2 * tileSizeInMeters;
export const yAmplitude = 0.04;
export const yOffset = 0;
export const ZOOM = 14;
export const SCALE = [0.125, 0.0625];

export const SIDE = {
  CENTER: 'center',
  TOP_LEFT: 'top-left',
  TOP: 'top',
  TOP_RIGHT: 'top-right',
  RIGHT: 'right',
  RIGHT_TOP: 'right-top',
  RIGHT_BOTTOM: 'right-bottom',
  BOTTOM_RIGHT: 'bottom-right',
  BOTTOM: 'bottom',
  BOTTOM_LEFT: 'bottom-left',
  LEFT: 'left',
  LEFT_TOP: 'left-top',
  LEFT_BOTTOM: 'left-bottom',
};

export type Side = typeof SIDE[keyof typeof SIDE];

const {
  TOP,
  TOP_LEFT,
  TOP_RIGHT,
  LEFT,
  LEFT_TOP,
  LEFT_BOTTOM,
  CENTER,
  RIGHT,
  RIGHT_TOP,
  RIGHT_BOTTOM,
  BOTTOM,
  BOTTOM_LEFT,
  BOTTOM_RIGHT,
} = SIDE;

export const TILE_DELTA_BY_SIDE = {
  [TOP_LEFT]: [-1, -1],
  [TOP]: [-1, 0],
  [TOP_RIGHT]: [-1, 1],
  [LEFT]: [0, -1],
  [CENTER]: [0, 0],
  [RIGHT]: [0, 1],
  [BOTTOM_LEFT]: [1, -1],
  [BOTTOM]: [1, 0],
  [BOTTOM_RIGHT]: [1, 1],
};

export const AROUND_TILES_POS = [
  TILE_DELTA_BY_SIDE[TOP_LEFT],
  TILE_DELTA_BY_SIDE[TOP],
  TILE_DELTA_BY_SIDE[TOP_RIGHT],
  TILE_DELTA_BY_SIDE[RIGHT],
  TILE_DELTA_BY_SIDE[BOTTOM],
  TILE_DELTA_BY_SIDE[BOTTOM_RIGHT],
  TILE_DELTA_BY_SIDE[LEFT],
  TILE_DELTA_BY_SIDE[BOTTOM_LEFT],
];

export const SIDE_BY_DELTA = {
  '-1,-1': TOP_LEFT,
  '-1,0': TOP,
  '-1,1': TOP_RIGHT,
  '0,-1': LEFT,
  '0,0': CENTER,
  '0,1': RIGHT,
  '1,-1': BOTTOM_LEFT,
  '1,0': BOTTOM,
  '1,1': BOTTOM_RIGHT,
};

export const TILE_SEAMS = {
  [TOP_LEFT]: [LEFT_TOP, TOP_LEFT],
  [TOP]: [TOP_LEFT, TOP, TOP_RIGHT],
  [TOP_RIGHT]: [TOP_RIGHT, RIGHT_TOP],
  [RIGHT]: [TOP_RIGHT, RIGHT, BOTTOM_RIGHT],
  [BOTTOM_RIGHT]: [RIGHT_BOTTOM, BOTTOM_RIGHT],
  [BOTTOM]: [BOTTOM_LEFT, BOTTOM, BOTTOM_RIGHT],
  [BOTTOM_LEFT]: [BOTTOM_LEFT, LEFT_BOTTOM],
  [LEFT]: [LEFT_TOP, LEFT, LEFT_BOTTOM],
  [CENTER]: [TOP, RIGHT, BOTTOM, LEFT],
};

export const SEAM_TILES = {
  // [tileSide]: [tileASide, tileBSide]
  [TOP_LEFT]: [TOP, TOP_LEFT],
  [TOP]: [CENTER, TOP],
  [TOP_RIGHT]: [TOP, TOP_RIGHT],
  [RIGHT_TOP]: [RIGHT, TOP_RIGHT],
  [RIGHT]: [CENTER, RIGHT],
  [RIGHT_BOTTOM]: [RIGHT, BOTTOM_RIGHT],
  [BOTTOM_RIGHT]: [BOTTOM, BOTTOM_RIGHT],
  [BOTTOM]: [CENTER, BOTTOM],
  [BOTTOM_LEFT]: [BOTTOM, BOTTOM_LEFT],
  [LEFT_BOTTOM]: [LEFT, BOTTOM_LEFT],
  [LEFT]: [CENTER, LEFT],
  [LEFT_TOP]: [LEFT, TOP_LEFT],
};

export const tileImageSize = 256;
export const tileSizeInMeters = tileImageSize;
export const HI_POLY_DIST = 0.2 * tileSizeInMeters;
export const yAmplitude = 0.04;
export const yOffset = 0;

export const SIDE = {
  TOP: 'top',
  TOP_LEFT: 'top-left',
  TOP_RIGHT: 'top-right',
  RIGHT: 'right',
  LEFT: 'left',
  BOTTOM: 'bottom',
  BOTTOM_RIGHT: 'bottom-right',
  BOTTOM_LEFT: 'bottom-left',
};

export type Side = typeof SIDE[keyof typeof SIDE];

const {
  TOP,
  TOP_LEFT,
  TOP_RIGHT,
  RIGHT,
  LEFT,
  BOTTOM,
  BOTTOM_LEFT,
  BOTTOM_RIGHT,
} = SIDE;

export const TILE_SIDES = [TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT];

export const TILE_DELTA_BY_SIDE = {
  [TOP_LEFT]: {
    [TOP_LEFT]: [0, 0],
    [TOP_RIGHT]: [0, 1],
    [BOTTOM_LEFT]: [1, 0],
    [BOTTOM_RIGHT]: [1, 1],
  },
  [TOP_RIGHT]: {
    [TOP_LEFT]: [0, -1],
    [TOP_RIGHT]: [0, 0],
    [BOTTOM_LEFT]: [1, -1],
    [BOTTOM_RIGHT]: [1, 0],
  },
  [BOTTOM_LEFT]: {
    [TOP_LEFT]: [-1, 0],
    [TOP_RIGHT]: [-1, 1],
    [BOTTOM_LEFT]: [0, 0],
    [BOTTOM_RIGHT]: [0, 1],
  },
  [BOTTOM_RIGHT]: {
    [TOP_LEFT]: [-1, -1],
    [TOP_RIGHT]: [-1, 0],
    [BOTTOM_LEFT]: [0, -1],
    [BOTTOM_RIGHT]: [0, 0],
  },
};

export const TILE_SEAMS = {
  [TOP_LEFT]: [TOP, LEFT],
  [TOP_RIGHT]: [TOP, RIGHT],
  [BOTTOM_RIGHT]: [BOTTOM, RIGHT],
  [BOTTOM_LEFT]: [BOTTOM, LEFT],
};

export const SEAM_TILES = {
  // [tileSide]: [tileASide, tileBSide]
  [TOP]: [TOP_LEFT, TOP_RIGHT],
  [RIGHT]: [TOP_RIGHT, BOTTOM_RIGHT],
  [BOTTOM]: [BOTTOM_LEFT, BOTTOM_RIGHT],
  [LEFT]: [TOP_LEFT, BOTTOM_LEFT],
};

export const OPPOSITE_SIDE = {
  [TOP_LEFT]: BOTTOM_RIGHT,
  [TOP_RIGHT]: BOTTOM_LEFT,
  [BOTTOM_LEFT]: TOP_RIGHT,
  [BOTTOM_RIGHT]: TOP_LEFT,
};

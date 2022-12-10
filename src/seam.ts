import { SIDE } from './constants';

const { TOP, LEFT, RIGHT, BOTTOM } = SIDE;

const getRelatedSide = (sideA, sideB) => {
  if (/top/.test(sideA) && /bottom/.test(sideB)) return [TOP, BOTTOM];
  if (/bottom/.test(sideA) && /top/.test(sideB)) return [BOTTOM, TOP];
  if (/left/.test(sideA) && /right/.test(sideB)) return [LEFT, RIGHT];
  if (/right/.test(sideA) && /left/.test(sideB)) return [RIGHT, LEFT];
};

function getIndexFactor(sideSize, _sideA, _sideB) {
  const [sideA, sideB] = getRelatedSide(_sideA, _sideB);

  if (sideA === BOTTOM && sideB === TOP) {
    return {
      a: i => i,
      b: i => (sideSize - 1) * sideSize + i,
    };
  }

  if (sideA === TOP && sideB === BOTTOM) {
    return {
      a: i => i + (sideSize - 1) * sideSize,
      b: i => i,
    };
  }

  if (sideA === RIGHT && sideB === LEFT) {
    return {
      a: i => i * sideSize,
      b: i => i * sideSize + sideSize - 1,
    };
  }

  if (sideA === LEFT && sideB === RIGHT) {
    return {
      a: i => i * sideSize + sideSize - 1,
      b: i => i * sideSize,
    };
  }
}

const viY = i => i * 3 + 1;

function seamTiles(tileA, tileB) {
  const sideA = tileA.side;
  const sideB = tileB.side;

  const posA = tileA.object.geometry.attributes.position;
  const posB = tileB.object.geometry.attributes.position;
  const normA = tileA.object.geometry.attributes.normal;
  const normB = tileB.object.geometry.attributes.normal;

  const verticesA = posA.array;
  const verticesB = posB.array;
  const normalsA = normA.array;
  const normalsB = normB.array;

  const sideSize = Math.sqrt(verticesA.length / 3);
  const getIndex = getIndexFactor(sideSize, sideA, sideB);

  // corner point
  let indexA;
  let indexB;
  let indexAnorm;
  let indexBnorm;
  let middle;

  const setAPoint = () => (verticesB[viY(indexB)] = verticesA[viY(indexA)]);
  const setMiddlePoint = () => {
    middle = Math.floor(
      (tileA.heightData[indexA] + tileB.heightData[indexB]) / 2
    );

    verticesB[viY(indexB)] = middle;
    verticesA[viY(indexA)] = middle;
  };

  const seamIndex = (i, setPosFn) => {
    indexA = getIndex.a(i);
    indexB = getIndex.b(i);

    setPosFn();

    indexAnorm = indexA * 3;
    indexBnorm = indexB * 3;

    normalsB[indexBnorm] = normalsA[indexAnorm];
    normalsB[indexBnorm + 1] = normalsA[indexAnorm + 1];
    normalsB[indexBnorm + 2] = normalsA[indexAnorm + 2];
  };

  // corner point
  seamIndex(0, setAPoint);

  for (let i = 1; i < sideSize - 1; i++) {
    seamIndex(i, setMiddlePoint);
  }

  // corner point
  seamIndex(sideSize - 1, setAPoint);

  posB.needsUpdate = true;
  posA.needsUpdate = true;
  normB.needsUpdate = true;
}

export function seamSameLevel(tileA, tileB) {
  // const { size, object } = centralTile;
  // const { position } = object.geometry.attributes;
  // const cornerDots = {
  //   [TOP_LEFT]: position[viY(0)],
  //   [TOP_RIGHT]: position[viY(size - 1)],
  //   [BOTTOM_LEFT]: position[viY(size * size - size)],
  //   [BOTTOM_RIGHT]: position[viY(size * size - 1)],
  // };

  seamTiles(tileA, tileB);
}

export function seamToPrevLevel(tile, parent) {
  switch (tile.clipSide) {
    case BOTTOM:
      const [parentTile1, parentTile2] = parent.tiles[0];

      for (let i = 0; i < parentTile1.size * 2; i += 4) {
        tile.heightData[i] = parentTile1.heightData[i];
      }
  }
}

import { SIDE } from './constants';

const { TOP, LEFT, RIGHT, BOTTOM, BOTTOM_RIGHT, BOTTOM_LEFT } = SIDE;

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

export function seamToPrevLevel(tile, terrain) {
  const { parent, tileSegmentsCount } = terrain;
  const halfTileSegmentsCount = (tileSegmentsCount - 1) / 2;
  const parentSegmentsCount = parent.tileSegmentsCount - 1;
  const segmentsDiff = parentSegmentsCount / ((tileSegmentsCount - 1) / 2);
  const pos = tile.object.geometry.attributes.position;

  // console.log('tileSegmentsCount', tileSegmentsCount);
  // console.log('segmentsDiff', segmentsDiff);

  console.log('seamToPrevLevel', tile.clipSide);

  switch (tile.clipSide) {
    case BOTTOM:
      seamtoPrevBottom({
        parent,
        tile,
        segmentsDiff,
        halfTileSegmentsCount,
        tileSegmentsCount,
      });

      break;

    case TOP:
      seamtoPrevTop({
        parent,
        tile,
        segmentsDiff,
        halfTileSegmentsCount,
        tileSegmentsCount,
      });

      break;

    case RIGHT:
      seamtoPrevRight({
        parent,
        tile,
        segmentsDiff,
        halfTileSegmentsCount,
        tileSegmentsCount,
      });

      break;

    case LEFT:
      seamtoPrevLeft({
        parent,
        tile,
        segmentsDiff,
        halfTileSegmentsCount,
        tileSegmentsCount,
      });

      break;

    case BOTTOM_RIGHT:
  }
}

function seamtoPrevBottom({
  parent,
  tile,
  segmentsDiff,
  halfTileSegmentsCount,
  tileSegmentsCount,
}) {
  const { position, normal } = tile.object.geometry.attributes;
  const posArr = position.array;
  const normArr = normal.array;
  let [pt1, pt2] = parent.tiles[0];
  let pt1Pos = pt1.object.geometry.attributes.position;
  let pt2Pos = pt2.object.geometry.attributes.position;
  let pt1Norm = pt1.object.geometry.attributes.normal;
  let pt2Norm = pt2.object.geometry.attributes.normal;
  let pt1PosArr = pt1Pos.array;
  let pt2PosArr = pt2Pos.array;
  let pt1NormArr = pt1Norm.array;
  let pt2NormArr = pt2Norm.array;

  const alignMidlePoints = (pos, index, segmentDeltaY) => {
    let pY = pos[viY(index)];

    for (let j = 1; j < segmentsDiff; j++) {
      const iY = viY(index + j);

      pY += segmentDeltaY;
      pos[iY] = pY;
    }
  };

  let i = 0;
  let currLevelIndex = halfTileSegmentsCount * tileSegmentsCount;
  let ptIndex = 0;
  let ptIndexPrev, pt1Y, pt2Y, pt1PrevY, pt2PrevY, pt1DeltaY, pt2DeltaY;

  for (; i <= halfTileSegmentsCount; ) {
    pt1Y = posArr[viY(currLevelIndex)];
    pt2Y = posArr[viY(currLevelIndex + halfTileSegmentsCount)];

    pt1PosArr[viY(ptIndex)] = pt1Y;
    pt2PosArr[viY(ptIndex)] = pt2Y;

    pt1NormArr[viY(ptIndex)] = normArr[viY(currLevelIndex)];
    pt2NormArr[viY(ptIndex)] =
      normArr[viY(currLevelIndex + halfTileSegmentsCount)];

    if (Number.isFinite(ptIndexPrev)) {
      pt1DeltaY = (pt1Y - pt1PrevY) / segmentsDiff;
      pt2DeltaY = (pt2Y - pt2PrevY) / segmentsDiff;

      alignMidlePoints(pt1PosArr, ptIndexPrev, pt1DeltaY);
      alignMidlePoints(pt2PosArr, ptIndexPrev, pt2DeltaY);
    }

    ptIndexPrev = ptIndex;
    pt1PrevY = pt1Y;
    pt2PrevY = pt2Y;

    currLevelIndex++;
    i++;
    ptIndex = i * segmentsDiff;
  }

  pt1Pos.needsUpdate = true;
  pt2Pos.needsUpdate = true;
  pt1Norm.needsUpdate = true;
  pt2Norm.needsUpdate = true;
}

function seamtoPrevTop({
  parent,
  tile,
  segmentsDiff,
  halfTileSegmentsCount,
  tileSegmentsCount,
}) {
  const { position, normal } = tile.object.geometry.attributes;
  const posArr = position.array;
  const normArr = normal.array;
  let [pt1, pt2] = parent.tiles[1];
  let pt1Pos = pt1.object.geometry.attributes.position;
  let pt2Pos = pt2.object.geometry.attributes.position;
  let pt1Norm = pt1.object.geometry.attributes.normal;
  let pt2Norm = pt2.object.geometry.attributes.normal;
  let pt1PosArr = pt1Pos.array;
  let pt2PosArr = pt2Pos.array;
  let pt1NormArr = pt1Norm.array;
  let pt2NormArr = pt2Norm.array;

  const alignMidlePoints = (pos, index, segmentDeltaY) => {
    let pY = pos[viY(index)];

    for (let j = 1; j < segmentsDiff; j++) {
      const iY = viY(index + j);

      pY += segmentDeltaY;
      pos[iY] = pY;
    }
  };

  let i = 0;
  let currLevelIndex = halfTileSegmentsCount * tileSegmentsCount;
  let ptIndex = parent.tileSegmentsCount * (parent.tileSegmentsCount - 1);
  let ptIndexPrev, pt1Y, pt2Y, pt1PrevY, pt2PrevY, pt1DeltaY, pt2DeltaY;

  for (; i <= halfTileSegmentsCount; ) {
    pt1Y = posArr[viY(currLevelIndex)];
    pt2Y = posArr[viY(currLevelIndex + halfTileSegmentsCount)];

    pt1PosArr[viY(ptIndex)] = pt1Y;
    pt2PosArr[viY(ptIndex)] = pt2Y;

    pt1NormArr[viY(ptIndex)] = normArr[viY(currLevelIndex)];
    pt2NormArr[viY(ptIndex)] =
      normArr[viY(currLevelIndex + halfTileSegmentsCount)];

    if (Number.isFinite(ptIndexPrev)) {
      pt1DeltaY = (pt1Y - pt1PrevY) / segmentsDiff;
      pt2DeltaY = (pt2Y - pt2PrevY) / segmentsDiff;

      alignMidlePoints(pt1PosArr, ptIndexPrev, pt1DeltaY);
      alignMidlePoints(pt2PosArr, ptIndexPrev, pt2DeltaY);
    }

    ptIndexPrev = ptIndex;
    pt1PrevY = pt1Y;
    pt2PrevY = pt2Y;

    currLevelIndex++;
    i++;
    ptIndex += segmentsDiff;
  }

  pt1Pos.needsUpdate = true;
  pt2Pos.needsUpdate = true;
  pt1Norm.needsUpdate = true;
  pt2Norm.needsUpdate = true;
}

function seamtoPrevRight({
  parent,
  tile,
  segmentsDiff,
  halfTileSegmentsCount,
  tileSegmentsCount,
}) {
  const { position, normal } = tile.object.geometry.attributes;
  const posArr = position.array;
  const normArr = normal.array;
  let [pt1, pt2] = [parent.tiles[0][0], parent.tiles[1][0]];
  let pt1Pos = pt1.object.geometry.attributes.position;
  let pt2Pos = pt2.object.geometry.attributes.position;
  let pt1Norm = pt1.object.geometry.attributes.normal;
  let pt2Norm = pt2.object.geometry.attributes.normal;
  let pt1PosArr = pt1Pos.array;
  let pt2PosArr = pt2Pos.array;
  let pt1NormArr = pt1Norm.array;
  let pt2NormArr = pt2Norm.array;

  const alignMidlePoints = (pos, index, segmentDeltaY) => {
    let pY = pos[viY(index)];

    for (
      let j = parent.tileSegmentsCount;
      j < parent.tileSegmentsCount * segmentsDiff;
      j += parent.tileSegmentsCount
    ) {
      pY += segmentDeltaY;
      pos[viY(index + j)] = pY;
    }
  };

  const halfTileDeltaIndex = tileSegmentsCount * halfTileSegmentsCount;
  let i = 0;
  let currLevelIndex = halfTileSegmentsCount;
  let ptIndex = 0;
  let ptIndexPrev, pt1Y, pt2Y, pt1PrevY, pt2PrevY, pt1DeltaY, pt2DeltaY;

  for (; i <= halfTileSegmentsCount; ) {
    pt1Y = posArr[viY(currLevelIndex)];
    pt2Y = posArr[viY(currLevelIndex + halfTileDeltaIndex)];

    pt1PosArr[viY(ptIndex)] = pt1Y;
    pt2PosArr[viY(ptIndex)] = pt2Y;

    pt1NormArr[viY(ptIndex)] = normArr[viY(currLevelIndex)];
    pt2NormArr[viY(ptIndex)] =
      normArr[viY(currLevelIndex + halfTileDeltaIndex)];

    if (Number.isFinite(ptIndexPrev)) {
      pt1DeltaY = (pt1Y - pt1PrevY) / segmentsDiff;
      pt2DeltaY = (pt2Y - pt2PrevY) / segmentsDiff;

      alignMidlePoints(pt1PosArr, ptIndexPrev, pt1DeltaY);
      alignMidlePoints(pt2PosArr, ptIndexPrev, pt2DeltaY);
    }

    ptIndexPrev = ptIndex;
    pt1PrevY = pt1Y;
    pt2PrevY = pt2Y;

    currLevelIndex += tileSegmentsCount;
    i++;
    ptIndex += parent.tileSegmentsCount * segmentsDiff;
  }

  pt1Pos.needsUpdate = true;
  pt2Pos.needsUpdate = true;
  pt1Norm.needsUpdate = true;
  pt2Norm.needsUpdate = true;
}

function seamtoPrevLeft({
  parent,
  tile,
  segmentsDiff,
  halfTileSegmentsCount,
  tileSegmentsCount,
}) {
  const { position, normal } = tile.object.geometry.attributes;
  const posArr = position.array;
  const normArr = normal.array;
  let [pt1, pt2] = [parent.tiles[0][1], parent.tiles[1][1]];
  let pt1Pos = pt1.object.geometry.attributes.position;
  let pt2Pos = pt2.object.geometry.attributes.position;
  let pt1Norm = pt1.object.geometry.attributes.normal;
  let pt2Norm = pt2.object.geometry.attributes.normal;
  let pt1PosArr = pt1Pos.array;
  let pt2PosArr = pt2Pos.array;
  let pt1NormArr = pt1Norm.array;
  let pt2NormArr = pt2Norm.array;

  const alignMidlePoints = (pos, index, segmentDeltaY) => {
    let pY = pos[viY(index)];

    for (
      let j = parent.tileSegmentsCount;
      j < parent.tileSegmentsCount * segmentsDiff;
      j += parent.tileSegmentsCount
    ) {
      pY += segmentDeltaY;
      pos[viY(index + j)] = pY;
    }
  };

  const halfTileDeltaIndex = tileSegmentsCount * halfTileSegmentsCount;
  let i = 0;
  let currLevelIndex = halfTileSegmentsCount;
  let ptIndex = parent.tileSegmentsCount - 1;
  let ptIndexPrev, pt1Y, pt2Y, pt1PrevY, pt2PrevY, pt1DeltaY, pt2DeltaY;

  for (; i <= halfTileSegmentsCount; ) {
    pt1Y = posArr[viY(currLevelIndex)];
    pt2Y = posArr[viY(currLevelIndex + halfTileDeltaIndex)];

    pt1PosArr[viY(ptIndex)] = pt1Y;
    pt2PosArr[viY(ptIndex)] = pt2Y;

    pt1NormArr[viY(ptIndex)] = normArr[viY(currLevelIndex)];
    pt2NormArr[viY(ptIndex)] =
      normArr[viY(currLevelIndex + halfTileDeltaIndex)];

    if (ptIndexPrev) {
      pt1DeltaY = (pt1Y - pt1PrevY) / segmentsDiff;
      pt2DeltaY = (pt2Y - pt2PrevY) / segmentsDiff;

      alignMidlePoints(pt1PosArr, ptIndexPrev, pt1DeltaY);
      alignMidlePoints(pt2PosArr, ptIndexPrev, pt2DeltaY);
    }

    ptIndexPrev = ptIndex;
    pt1PrevY = pt1Y;
    pt2PrevY = pt2Y;

    currLevelIndex += tileSegmentsCount;
    i++;
    ptIndex += parent.tileSegmentsCount * segmentsDiff;
  }

  pt1Pos.needsUpdate = true;
  pt2Pos.needsUpdate = true;
  pt1Norm.needsUpdate = true;
  pt2Norm.needsUpdate = true;
}

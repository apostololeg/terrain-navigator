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

export function seamToPrevLevel(tile, terrain) {
  const { parent, tileSegmentsCount } = terrain;
  const halfTileSegmentsCount = (tileSegmentsCount - 1) / 2;
  const parentSegmentsCount = parent.tileSegmentsCount - 1;
  const segmentsDiff = parentSegmentsCount / ((tileSegmentsCount - 1) / 2);
  const pos = tile.object.geometry.attributes.position;

  // console.log('tileSegmentsCount', tileSegmentsCount);
  // console.log('segmentsDiff', segmentsDiff);

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

    // case RIGHT:
    //   seamtoPrevRight({
    //     parent,
    //     tile,
    //     segmentsDiff,
    //     halfTileSegmentsCount,
    //     tileSegmentsCount,
    //   });

    //   break;
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

  const alignMidlePoints = (arr, index) => {
    let currY = arr[viY(index)];
    const nextY = arr[viY(index + segmentsDiff)];
    const segmentDeltaY = (nextY - currY) / segmentsDiff;

    // console.log(index, currY, nextY, segmentDeltaY);

    for (let j = 1; j < segmentsDiff; j++) {
      currY += segmentDeltaY;
      // console.log('\t', index + j, currY);
      arr[viY(index + j)] = currY;
    }
  };

  let i = 0;
  let currLevelIndex = halfTileSegmentsCount * tileSegmentsCount;
  let ptIndex = 0;

  for (; i < halfTileSegmentsCount; ) {
    // console.log('currLevelIndex', currLevelIndex, posArr[viY(currLevelIndex)]);
    // console.log(
    //   'currLevelIndex + halfTileSegmentsCount',
    //   currLevelIndex + halfTileSegmentsCount,
    //   posArr[viY(currLevelIndex + halfTileSegmentsCount)]
    // );

    posArr[viY(currLevelIndex)] = pt1PosArr[viY(ptIndex)];
    posArr[viY(currLevelIndex + halfTileSegmentsCount)] =
      pt2PosArr[viY(ptIndex)];

    normArr[viY(currLevelIndex)] = pt1NormArr[viY(ptIndex)];
    normArr[viY(currLevelIndex + halfTileSegmentsCount)] =
      pt2NormArr[viY(ptIndex)];

    alignMidlePoints(pt1PosArr, ptIndex);
    alignMidlePoints(pt2PosArr, ptIndex);

    currLevelIndex++;
    i++;
    ptIndex = i * 4;
  }

  posArr[viY(currLevelIndex + halfTileSegmentsCount)] = pt2PosArr[viY(ptIndex)];

  position.needsUpdate = true;
  pt1Pos.needsUpdate = true;
  pt2Pos.needsUpdate = true;
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

  const alignMidlePoints = (pos, index) => {
    let currY = pos[viY(index)];
    const nextY = pos[viY(index + segmentsDiff)];
    const segmentDeltaY = (nextY - currY) / segmentsDiff;

    console.log(index, currY, nextY, segmentDeltaY);

    for (let j = 1; j < segmentsDiff; j++) {
      currY += segmentDeltaY;
      console.log('\t', index + j, currY);
      pos[viY(index + j)] = currY;
    }
  };

  let i = 0;
  let currLevelIndex = halfTileSegmentsCount * tileSegmentsCount;
  let ptIndex = parent.tileSegmentsCount * (parent.tileSegmentsCount - 1);

  for (; i < halfTileSegmentsCount; ) {
    console.log('currLevelIndex', currLevelIndex, posArr[viY(currLevelIndex)]);
    console.log(
      'currLevelIndex + halfTileSegmentsCount',
      currLevelIndex + halfTileSegmentsCount,
      posArr[viY(currLevelIndex + halfTileSegmentsCount)]
    );
    console.log('ptIndex', ptIndex);
    console.log('pt1PosArr[viY(ptIndex)]', pt1PosArr[viY(ptIndex)]);
    console.log('pt2PosArr[viY(ptIndex)]', pt2PosArr[viY(ptIndex)]);

    posArr[viY(currLevelIndex)] = pt1PosArr[viY(ptIndex)];
    posArr[viY(currLevelIndex + halfTileSegmentsCount)] =
      pt2PosArr[viY(ptIndex)];

    normArr[viY(currLevelIndex)] = pt1NormArr[viY(ptIndex)];
    normArr[viY(currLevelIndex + halfTileSegmentsCount)] =
      pt2NormArr[viY(ptIndex)];

    alignMidlePoints(pt1PosArr, ptIndex);
    alignMidlePoints(pt2PosArr, ptIndex);

    currLevelIndex++;
    i++;
    ptIndex += 4;
  }

  posArr[viY(currLevelIndex + halfTileSegmentsCount)] = pt2PosArr[viY(ptIndex)];

  position.needsUpdate = true;
  normal.needsUpdate = true;

  pt1Pos.needsUpdate = true;
  pt2Pos.needsUpdate = true;
}

// function seamtoPrevRight({
//   parent,
//   tile,
//   segmentsDiff,
//   halfTileSegmentsCount,
//   tileSegmentsCount,
// }) {
//   const { position, normal } = tile.object.geometry.attributes;
//   const posArr = position.array;
//   const normArr = normal.array;
//   let [pt1, pt2] = [parent.tiles[0][0], parent.tiles[0][1]];
//   let pt1Pos = pt1.object.geometry.attributes.position;
//   let pt2Pos = pt2.object.geometry.attributes.position;
//   let pt1Norm = pt1.object.geometry.attributes.normal;
//   let pt2Norm = pt2.object.geometry.attributes.normal;
//   let pt1PosArr = pt1Pos.array;
//   let pt2PosArr = pt2Pos.array;
//   let pt1NormArr = pt1Norm.array;
//   let pt2NormArr = pt2Norm.array;

//   const alignMidlePoints = (pos, index) => {
//     let currY = pos[viY(index)];
//     const nextY = pos[viY(index + segmentsDiff)];
//     const segmentDeltaY = (nextY - currY) / segmentsDiff;

//     console.log(index, currY, nextY, segmentDeltaY);

//     for (let j = 1; j < segmentsDiff; j++) {
//       currY += segmentDeltaY;
//       console.log('\t', index + j, currY);
//       pos[viY(index + j)] = currY;
//     }
//   };

//   let i = 0;
//   let currLevelIndex = halfTileSegmentsCount * tileSegmentsCount;
//   let ptIndex = parent.tileSegmentsCount * (parent.tileSegmentsCount - 1);

//   for (; i < halfTileSegmentsCount; ) {
//     console.log('currLevelIndex', currLevelIndex, posArr[viY(currLevelIndex)]);
//     console.log(
//       'currLevelIndex + halfTileSegmentsCount',
//       currLevelIndex + halfTileSegmentsCount,
//       posArr[viY(currLevelIndex + halfTileSegmentsCount)]
//     );
//     console.log('ptIndex', ptIndex);
//     console.log('pt1PosArr[viY(ptIndex)]', pt1PosArr[viY(ptIndex)]);
//     console.log('pt2PosArr[viY(ptIndex)]', pt2PosArr[viY(ptIndex)]);

//     posArr[viY(currLevelIndex)] = pt1PosArr[viY(ptIndex)];
//     posArr[viY(currLevelIndex + halfTileSegmentsCount)] =
//       pt2PosArr[viY(ptIndex)];

//     normArr[viY(currLevelIndex)] = pt1NormArr[viY(ptIndex)];
//     normArr[viY(currLevelIndex + halfTileSegmentsCount)] =
//       pt2NormArr[viY(ptIndex)];

//     alignMidlePoints(pt1PosArr, ptIndex);
//     alignMidlePoints(pt2PosArr, ptIndex);

//     currLevelIndex++;
//     i++;
//     ptIndex += 4;
//   }

//   posArr[viY(currLevelIndex + halfTileSegmentsCount)] = pt2PosArr[viY(ptIndex)];

//   position.needsUpdate = true;
//   normal.needsUpdate = true;

//   pt1Pos.needsUpdate = true;
//   pt2Pos.needsUpdate = true;
// }

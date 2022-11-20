import { SIDE } from './constants';

const { TOP, LEFT, RIGHT, BOTTOM } = SIDE;

const getMiddlePoint = (first, last) => first + (last - first) / 2;

const getRelatedSide = (sideA, sideB) => {
  if (/top/.test(sideA) && /bottom/.test(sideB)) return [TOP, BOTTOM];
  if (/bottom/.test(sideA) && /top/.test(sideB)) return [BOTTOM, TOP];
  if (/left/.test(sideA) && /right/.test(sideB)) return [LEFT, RIGHT];
  if (/right/.test(sideA) && /left/.test(sideB)) return [RIGHT, LEFT];
};

function getIndexFactor(sideSizeA, sideSizeB, _sideA, _sideB) {
  const [sideA, sideB] = getRelatedSide(_sideA, _sideB);

  if (sideA === BOTTOM && sideB === TOP) {
    return {
      a: i => i,
      b: i => (sideSizeB - 1) * sideSizeB + i,
    };
  }

  if (sideA === TOP && sideB === BOTTOM) {
    return {
      a: i => i + (sideSizeA - 1) * sideSizeA,
      b: i => i,
    };
  }

  if (sideA === RIGHT && sideB === LEFT) {
    return {
      a: i => i * sideSizeA,
      b: i => i * sideSizeB + sideSizeB - 1,
    };
  }

  if (sideA === LEFT && sideB === RIGHT) {
    return {
      a: i => i * sideSizeA + sideSizeA - 1,
      b: i => i * sideSizeB,
    };
  }
}

const viY = i => i * 3 + 1;

function seamTiles(tileA, tileB, sideAScale) {
  const sideA = tileA.side;
  const sideB = tileB.side;
  const posA = tileA.object.geometry.attributes.position;
  const posB = tileB.object.geometry.attributes.position;
  const verticesA = posA.array;
  const verticesB = posB.array;
  const sideSizeA = Math.sqrt(verticesA.length / 3);
  const sideSizeB = Math.sqrt(verticesB.length / 3);
  const getIndex = getIndexFactor(sideSizeA, sideSizeB, sideA, sideB);
  const middlePointsCount = sideAScale - 1;
  const seamHiPolyMiddlePoint = middlePointsCount
    ? i => {
        const dot1Y = verticesA[viY(getIndex.a(i))];
        const dot2Y = verticesA[viY(getIndex.a(i + sideAScale))];

        if (!dot1Y || !dot2Y) return;

        for (let j = 1; j <= middlePointsCount; j++) {
          const index = viY(getIndex.a(i + j));
          verticesA[index] = getMiddlePoint(dot1Y, dot2Y);
        }
      }
    : () => {};

  // corner point
  let indexA = getIndex.a(0);
  let indexB = getIndex.b(0);
  let middle;

  verticesB[viY(indexB)] = verticesA[viY(indexA)];
  seamHiPolyMiddlePoint(0);

  for (let i = 1; i < sideSizeB - 1; i++) {
    indexA = getIndex.a(i * sideAScale);
    indexB = getIndex.b(i);
    middle = Math.floor(
      (tileA.heightData[indexA] + tileB.heightData[indexB]) / 2
    );

    verticesB[viY(indexB)] = middle;
    verticesA[viY(indexA)] = middle;
  }

  // align middle points (after main points are merged)
  for (let i = 1; i < sideSizeB - 1; i++) {
    seamHiPolyMiddlePoint(i * sideAScale);
  }

  // corner point
  indexA = getIndex.a((sideSizeB - 1) * sideAScale);
  indexB = getIndex.b(sideSizeB - 1);
  verticesB[viY(indexB)] = verticesA[viY(indexA)];

  posB.needsUpdate = true;
  posA.needsUpdate = true;
}

function copyNormals(tileA, tileB, sideAScale) {
  const sideA = tileA.side;
  const sideB = tileB.side;
  const normA = tileA.object.geometry.attributes.normal;
  const normB = tileB.object.geometry.attributes.normal;
  const normalsA = normA.array;
  const normalsB = normB.array;
  const sideSizeA = Math.sqrt(normalsA.length / 3);
  const sideSizeB = Math.sqrt(normalsB.length / 3);

  const getIndex = getIndexFactor(sideSizeA, sideSizeB, sideA, sideB);

  for (let i = 0; i < sideSizeB; i++) {
    const indexA = getIndex.a(i * sideAScale) * 3;
    const indexB = getIndex.b(i) * 3;

    normalsB[indexB] = normalsA[indexA];
    normalsB[indexB + 1] = normalsA[indexA + 1];
    normalsB[indexB + 2] = normalsA[indexA + 2];
  }

  normB.needsUpdate = true;
}

export default function seam(tileA, tileB, sideAScale = 1) {
  // const { size, object.geometry } = centralTile;
  // const { position } = object.geometry.attributes;
  // const cornerDots = {
  //   [TOP_LEFT]: position[viY(0)],
  //   [TOP_RIGHT]: position[viY(size - 1)],
  //   [BOTTOM_LEFT]: position[viY(size * size - size)],
  //   [BOTTOM_RIGHT]: position[viY(size * size - 1)],
  // };

  seamTiles(tileA, tileB, sideAScale);
  copyNormals(tileA, tileB, sideAScale);
}

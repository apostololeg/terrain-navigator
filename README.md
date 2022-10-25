# Terrain navigator

- get height data from mapbox API by coordinates
- cache height data in IndexDB
- create terrains far from observer position
- resize imageData for low-poly tiles
- [optimize rendering at very far distances](https://discourse.threejs.org/t/moving-the-camera-model-will-shake-if-the-coordinates-are-large/7214)
- rebuild tiles after change observer position

## Quick start

```js
import TerrainNavigator from 'terrain-navigator';

const scene: THREE.Scene;
const observer: THREE.Object3D;

const terrain = new TerrainNavigator({
  container: scene,
  material: new MeshPhongMaterial({
    color: 0x424240,
    shininess: 0.1,
    // wireframe: true,
  });,
  getPosition() {
    return observer.target.position;
  },
  setPosition(pos) {
    const { position } = observer.object;

    Object.entries(pos).forEach(([key, val]) => {
      if (Number.isFinite(val)) position[key] = val;
    });
  },
  onTileRebuilded(tile, oldObject) {
    if (oldObject) observer.removeTeleportTargets([oldObject]);

    scene.add(tile.object);

    if (tile.isNear) observer.addTeleportTargets([tile.object]);

    editor.dyeTile(tile);
  },
});

// every time you change the observer position:
terrain.update();
```

TODO:

- move data processing to Worker

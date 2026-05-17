# 3D Model Assets

The editor expects the exact product model at:

```text
public/models/ikea-3-drawer.glb
```

Browsers cannot load `.blend` files directly. Export the root `Ikea 3-Drawer.blend` source file to GLB with Blender:

```powershell
blender --background "Ikea 3-Drawer.blend" --python scripts/export_blend_to_glb.py -- public/models/ikea-3-drawer.glb
```

Until that GLB exists, the MVP uses a procedural Three.js drawer model so the overlay remains a real 3D object rather than a PNG.


"""Export the GlassFit Blender source model to a browser-ready GLB.

Run with Blender, not regular Python:

blender --background "Ikea 3-Drawer.blend" --python scripts/export_blend_to_glb.py -- public/models/ikea-3-drawer.glb
"""

from __future__ import annotations

import sys
from pathlib import Path

import bpy


def main() -> None:
    output_path = _get_output_path()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    _prepare_scene()

    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
    )

    print(f"Exported GLB: {output_path}")


def _get_output_path() -> Path:
    if "--" in sys.argv:
        args = sys.argv[sys.argv.index("--") + 1 :]
    else:
        args = []

    if args:
        return Path(args[0]).resolve()

    return Path("public/models/ikea-3-drawer.glb").resolve()


def _prepare_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")

    for obj in bpy.context.selected_objects:
        obj.hide_viewport = False
        obj.hide_render = False

    # Keep transforms baked for predictable browser sizing.
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


if __name__ == "__main__":
    main()


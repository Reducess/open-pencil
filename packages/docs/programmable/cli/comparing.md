---
title: Comparing Designs
description: Diff nodes and documents structurally and visually, and apply property patches.
---

# Comparing Designs

The `diff` commands compare two nodes, preview or apply property changes as patches, render pixel diffs, and compare whole documents. Each node command works on a file or, without one, on the document open in the running app.

## Property patches

```sh
openpencil diff create design.fig --from 1:23 --to 1:87
```

Prints a unified diff of the properties that differ — size, position, fills, strokes, effects, radius, and text — with children matched by name path:

```diff
--- /Card/Header #1:24
+++ /Card/Header #1:88
@@ -1,4 +1,4 @@
 type: FRAME
 size: 320 48
-fill: #FFFFFF
+fill: #F4F4F5
```

`diff show` previews the patch a change would produce without making it:

```sh
openpencil diff show 1:24 design.fig --props '{"fill": "#F4F4F5", "radius": 8}' > header.diff
```

`diff apply` applies a patch. Every node must still have the patch's old values, so a patch made against an older state changes nothing instead of half-applying:

```sh
openpencil diff apply header.diff design.fig --dry-run   # validate first
openpencil diff apply header.diff design.fig --write     # save in place
openpencil diff apply header.diff design.fig -o out.fig  # save elsewhere
```

Nodes a patch removes are deleted. Patches cannot create nodes; use `render` or `eval` for new content.

## JSX diff

```sh
openpencil diff jsx design.fig --from 1:23 --to 1:87
```

Compares two subtrees as design JSX, which shows added, removed, and reordered children more clearly than property patches.

## Visual diff

```sh
openpencil diff visual design.fig --from 1:23 --to 1:87 --output diff.png
```

Renders both nodes at the same scale and writes a PNG with changed pixels in red over a faded copy of the source. The report includes the changed pixel ratio and the changed region in source-node coordinates. `--scale` and `--max-edge` bound the render the same way `export_image` does; `--threshold` sets the color tolerance.

## Comparing documents

```sh
openpencil diff files before.fig after.fig
openpencil diff files before.fig after.fig --page "Mobile" --json
```

Compares two documents page by page. Pages match by name and nodes by name path, so two versions of a file compare even though node IDs differ. Like `diff(1)`, the command exits with status 1 when the documents differ.

## Agents

The same operations are available as the `diff_create`, `diff_jsx`, `diff_show`, `diff_apply`, and `diff_visual` tools for the built-in AI chat and MCP clients. `diff_visual` returns its image to the model, so an agent can confirm that an edit touched only the intended region.

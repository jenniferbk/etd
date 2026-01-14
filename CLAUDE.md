# Extended Toulmin Diagram Editor

Web-based visual editor for creating Extended Toulmin argumentation diagrams used in mathematics education research.

## Tech Stack
- React 18 + TypeScript + Vite
- Konva.js (react-konva) for canvas
- Tailwind CSS for UI
- Zustand for state management

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run preview` — Preview production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript check

## Key Files
- `docs/REQUIREMENTS.md` — Full specification (READ THIS FIRST)
- `src/components/Canvas/` — Konva canvas and element rendering
- `src/components/Palette/` — Element palette sidebar
- `src/components/Properties/` — Properties panel for selected elements
- `src/store/` — Zustand stores for diagram state
- `src/types/` — TypeScript interfaces for elements, connections

## Browser Testing
Claude for Chrome is available. Use it to:
- Test drag-drop interactions on canvas
- Verify element rendering (colors, dashed borders, cloud shapes)
- Test export functionality (PNG/SVG download)
- Verify image embedding in elements

## Code Style
- Functional components with hooks
- Named exports for components
- Types in separate files, co-located with features
- Konva shapes as separate components in `Canvas/shapes/`

## Critical Rendering Details
These visual details matter for research accuracy — refer to REQUIREMENTS.md Section 2:
- Dashed borders must render as dashes (not dotted, not solid)
- Cloud/thought bubble shape for "implicit" elements (not rounded rectangle)
- Perpendicular warrant attachment to data→claim arrows
- Element colors are semantically meaningful — match exactly

## Development Workflow
1. Read REQUIREMENTS.md before starting any feature
2. Build incrementally — get one element type working before adding more
3. Test in browser with Claude for Chrome after each major change
4. Verify visual accuracy against reference screenshots in docs/

## Deployment to jenkleiman.com

**IMPORTANT:** This project uses TWO repositories. After pushing changes to the ETD repo, you must also update jenkleiman.com:

1. Commit and push changes to this repo (`jenniferbk/etd`)
2. Build the project: `npm run build`
3. Copy built files to jenkleiman.com repo:
   ```bash
   rm -rf ~/Documents/GitHub/jenkleiman.com/public/tools/etd/*
   cp -r dist/* ~/Documents/GitHub/jenkleiman.com/public/tools/etd/
   ```
4. Commit and push jenkleiman.com repo:
   ```bash
   cd ~/Documents/GitHub/jenkleiman.com
   git add public/tools/etd/
   git commit -m "Update ETD tool: [description of changes]"
   git push
   ```

The site deploys automatically via Netlify when jenkleiman.com repo is pushed.

## Importing DiagramMix .drawing Files

DiagramMix files can be imported using the conversion script:

```bash
# Convert .drawing to .json
python scripts/convert-drawing.py input.drawing output.json

# Then use "Load diagram" in the app to import the .json
```

The converter extracts:
- Element positions and sizes
- Text content (including timestamps like "(0:09:13.2)")
- Color schemes → contributor types (colorSchemeId 1=given, 10=student)

Note: Connections are not currently imported (DiagramMix uses complex connection structures).

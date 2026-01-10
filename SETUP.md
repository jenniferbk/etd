# Project Setup

## 1. Create new Vite project

```bash
npm create vite@latest toulmin-editor -- --template react-ts
cd toulmin-editor
```

## 2. Install dependencies

```bash
# Core canvas library
npm install konva react-konva

# State management
npm install zustand

# Styling
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# File export utilities
npm install file-saver
npm install -D @types/file-saver

# PDF export (optional, can add later)
npm install jspdf
```

## 3. Set up project structure

```
toulmin-editor/
├── CLAUDE.md                    # ← Drop the CLAUDE.md here
├── docs/
│   ├── REQUIREMENTS.md          # ← Drop the requirements doc here
│   └── screenshots/             # ← Add reference screenshots here
│       ├── example1.png
│       └── example2.png
├── src/
│   ├── components/
│   │   ├── Canvas/
│   │   │   ├── Canvas.tsx
│   │   │   ├── shapes/
│   │   │   │   ├── ArgumentElement.tsx
│   │   │   │   ├── TeacherSupport.tsx
│   │   │   │   ├── ImplicitCloud.tsx
│   │   │   │   └── Arrow.tsx
│   │   │   └── index.ts
│   │   ├── Palette/
│   │   │   ├── Palette.tsx
│   │   │   ├── PaletteItem.tsx
│   │   │   └── index.ts
│   │   ├── Properties/
│   │   │   ├── PropertiesPanel.tsx
│   │   │   ├── ImageUpload.tsx
│   │   │   └── index.ts
│   │   ├── Toolbar/
│   │   │   ├── Toolbar.tsx
│   │   │   └── index.ts
│   │   └── Legend/
│   │       ├── Legend.tsx
│   │       └── index.ts
│   ├── store/
│   │   ├── diagramStore.ts      # Main Zustand store
│   │   ├── selectionStore.ts    # Selection state
│   │   └── index.ts
│   ├── types/
│   │   ├── elements.ts          # Element type definitions
│   │   ├── connections.ts       # Connection type definitions
│   │   └── index.ts
│   ├── utils/
│   │   ├── export.ts            # PNG/SVG/PDF export
│   │   ├── fileIO.ts            # Save/load JSON
│   │   └── colors.ts            # Color constants
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── public/
└── package.json
```

## 4. Configure Tailwind

In `tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

In `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## 5. Start Claude Code

```bash
cd toulmin-editor
claude
```

Then tell it:
```
Read docs/REQUIREMENTS.md and build the Extended Toulmin Diagram Editor. 
Start with the basic canvas and one element type (Student Contribution rectangle).
Use Claude for Chrome to verify rendering after each component.
```

## Suggested Build Order

1. **Canvas basics** — Empty Konva stage with zoom/pan
2. **One element type** — Student contribution (blue dashed rectangle)
3. **Drag from palette** — Basic palette with drag-to-canvas
4. **Selection & properties** — Click to select, show properties panel
5. **All element types** — Add remaining shapes with correct styling
6. **Connections** — Arrow tool connecting elements
7. **Image embedding** — Add images to elements
8. **Legend** — Auto-generated key
9. **File I/O** — Save/load JSON
10. **Export** — PNG/SVG/PDF

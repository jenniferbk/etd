# Extended Toulmin Diagram Editor
## Requirements Specification Document

**Version:** 1.0  
**Date:** January 10, 2026  
**Purpose:** Web-based visual editor for creating Extended Toulmin argumentation diagrams used in mathematics education research, based on AnnaMarie Conner's framework for analyzing collective argumentation in classrooms.

---

## 1. Overview

### 1.1 Background
Extended Toulmin diagrams expand Stephen Toulmin's model of argumentation to analyze classroom discourse. They track not only argument structure (claims, data, warrants, etc.) but also **who contributed each component** (teacher vs. students) and **how teachers support argumentation** through questioning and other moves.

### 1.2 Core Use Cases
1. Researchers analyze video/transcript data of classroom mathematical discussions
2. Create diagrams showing argument flow and contributor attribution
3. Embed video screenshots as evidence within diagram elements
4. Export publication-ready diagrams for papers and presentations
5. Save/load diagrams for iterative analysis

---

## 2. Element Types

### 2.1 Argument Components (Toulmin Elements)

These are the structural components of arguments. Each can be contributed by students, teachers, or jointly.

| Component | Description | Can Connect To |
|-----------|-------------|----------------|
| **Data** | Facts, evidence, or given information | Claims, Warrants |
| **Claim** | Assertion being argued for | Other Claims (as data) |
| **Warrant** | Reasoning connecting data to claim | Claims |
| **Backing** | Support for the warrant | Warrants |
| **Qualifier** | Conditions limiting the claim | Claims |
| **Rebuttal** | Exceptions or counterarguments | Claims, Warrants, or the Data→Claim connection (perpendicular attachment) |

**Compound Types:** Elements can serve dual roles, indicated by compound labels:
- "Warrant/Data 1" — serves as warrant for one claim and data for another
- "Data/Claim 1" — functions as both

### 2.2 Contributor Styles

Each argument component is styled based on who contributed it:

| Contributor | Shape | Border Style | Border Color | Fill |
|-------------|-------|--------------|--------------|------|
| Given/Initial Data | Rectangle | Solid (3px) | Green (#228B22) | White or light green |
| Student Contribution | Rectangle | Dashed (3px) | Blue (#0000CD) | White |
| Joint (Teacher+Student) | Rectangle | Dashed (3px) | Purple (#800080) | White |
| Implicit | Cloud/Thought bubble | Solid (2px) | Black (#000000) | White |

### 2.3 Teacher Support Elements

Teacher actions that support (but are not part of) the argument structure:

| Type | Shape | Border Style | Border Color | Fill Color |
|------|-------|--------------|--------------|------------|
| Teacher Action (general) | Ellipse | Solid (2px) | Red (#CC0000) | White |
| Question (coded) | Rounded Rectangle | Solid (2px) | Aqua (#00CED1) | Light aqua (#E0FFFF) |
| Other Support (coded) | Rounded Rectangle | Solid (2px) | Gold (#DAA520) | Light yellow (#FFFACD) |

**Other Support Subtypes** (displayed as label within element):
- Displays
- Suggests
- Summarizes
- Restates
- Highlights
- Validates
- (User should be able to add custom subtypes)

### 2.4 Element Content Structure

Each element contains:

```
┌─────────────────────────────────┐
│ [Underlined Label]              │  ← e.g., "Claim 1", "Warrant/Data 2"
│                                 │
│ [Main text content]             │  ← The actual argument content
│                                 │
│ [Optional: Embedded Image]      │  ← Video screenshot
│                                 │
│ [Optional: Attribution]         │  ← e.g., "(E1, 43:00)" or "(B, 45:25)"
└─────────────────────────────────┘
```

**Text Formatting:**
- Label: Underlined, positioned at top
- Content: Regular text, may include brackets for implied/reconstructed speech
- Attribution: Smaller text, parenthetical, typically includes speaker code and timestamp

---

## 3. Connections

### 3.1 Arrow Types

| Arrow Type | Style | Color | Use |
|------------|-------|-------|-----|
| Standard Support | Solid line, filled arrowhead | Black | Data→Claim, Warrant→Claim, etc. |

### 3.2 Connection Rules
- Arrows originate from: Data, Warrant, Backing, Claim (when serving as data)
- Arrows terminate at: Claims, Warrants
- Warrants typically connect to the arrow between Data and Claim (perpendicular attachment)
- Backing connects to Warrants
- Qualifiers connect to Claims
- Rebuttals connect to Claims, or attach perpendicularly to a Data→Claim connection (to rebut the inference itself)

### 3.3 Teacher Element Positioning
- Teacher questioning/support elements are positioned **adjacent to or overlapping** the argument element they relate to
- They do NOT use arrows to connect; spatial proximity indicates relationship
- Multiple teacher elements can cluster around a single argument element

---

## 4. User Interface

### 4.1 Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ [Toolbar]                                                          │
│ Save | Load | Export PNG | Export SVG | Export PDF | Undo | Redo   │
├──────────────┬─────────────────────────────────────────────────────┤
│              │                                                     │
│  [Element    │              [Canvas Area]                          │
│   Palette]   │                                                     │
│              │   - Infinite/large scrollable canvas                │
│  ┌─────────┐ │   - Grid background (optional, toggleable)          │
│  │ Data    │ │   - Zoom controls                                   │
│  └─────────┘ │                                                     │
│  ┌─────────┐ │                                                     │
│  │ Claim   │ │                                                     │
│  └─────────┘ │                                                     │
│  ┌─────────┐ │                                                     │
│  │ Warrant │ │                                                     │
│  └─────────┘ │                                                     │
│  ...        │                                                     │
│              │                                                     │
│  [Contrib.  │                                                     │
│   Selector] │                                                     │
│  ○ Given    │                                                     │
│  ○ Student  │                                                     │
│  ○ Joint    │                                                     │
│  ○ Implicit │                                                     │
│              │                                                     │
│  [Teacher   │                                                     │
│   Support]  │                                                     │
│  ┌─────────┐ │                                                     │
│  │Question │ │                                                     │
│  └─────────┘ │                                                     │
│  ┌─────────┐ │                                                     │
│  │Other    │ │                                                     │
│  └─────────┘ │                                                     │
│              │                                                     │
├──────────────┴─────────────────────────────────────────────────────┤
│ [Properties Panel - appears when element selected]                 │
│ Label: [________] Type: [Claim ▼] Number: [1]                      │
│ Content: [________________________]                                │
│ Attribution: [________] Timestamp: [__:__]                         │
│ Image: [Choose File] [Clear]                                       │
└────────────────────────────────────────────────────────────────────┘
```

### 4.2 Palette Behavior
1. Click element type in palette
2. Select contributor type (for argument components) or support type (for teacher elements)
3. Click on canvas to place element
4. OR drag from palette to canvas

### 4.3 Element Interactions

**Selection:**
- Click to select single element
- Shift+click for multi-select
- Click+drag on canvas for marquee selection

**Editing:**
- Double-click element to edit text inline
- Selected element shows properties in Properties Panel
- Drag to move
- Drag handles to resize

**Connections:**
- Select source element
- Press 'C' or click "Connect" button
- Click target element
- Arrow appears connecting them
- Click on arrow to select and edit properties

**Context Menu (right-click):**
- Edit
- Duplicate
- Delete
- Bring to Front / Send to Back
- Change Contributor Type
- Add Image

### 4.4 Key/Legend Generator

**Auto-generated legend** showing all element types used in current diagram:
- Can be positioned anywhere on canvas
- Updates automatically when new element types are added
- Toggleable visibility
- Styled to match the examples (boxed, labeled)

---

## 5. Image Embedding

### 5.1 Supported Formats
- PNG, JPG, GIF
- Paste from clipboard (Cmd/Ctrl+V when element selected)
- Drag and drop onto element
- File picker in properties panel

### 5.2 Image Display
- Thumbnail within element (max height ~100px, scales proportionally)
- Click to expand/view full size in modal
- Image positioned below text content, above attribution

### 5.3 Image Source
Primary use case: Screenshots from classroom video
- User captures screenshot externally
- Pastes or imports into element
- Timestamp in attribution corresponds to video time

---

## 6. File Operations

### 6.1 Save Format
**JSON structure:**
```json
{
  "version": "1.0",
  "metadata": {
    "title": "Episode 4 Analysis",
    "author": "Researcher Name",
    "created": "2026-01-10T14:30:00Z",
    "modified": "2026-01-10T15:45:00Z"
  },
  "canvas": {
    "width": 2000,
    "height": 1500,
    "zoom": 1.0,
    "panX": 0,
    "panY": 0
  },
  "elements": [
    {
      "id": "elem-001",
      "type": "argument",
      "argumentType": "claim",
      "contributor": "student",
      "label": "Claim 1",
      "content": "It's not growth or decay.",
      "attribution": {
        "speaker": "S1",
        "timestamp": "12:34"
      },
      "image": null,
      "position": { "x": 400, "y": 100 },
      "size": { "width": 180, "height": 80 }
    },
    {
      "id": "elem-002",
      "type": "teacherSupport",
      "supportType": "question",
      "subtype": null,
      "content": "Why is this one not growing or decay?",
      "attribution": {
        "code": "ER1",
        "timestamp": null
      },
      "position": { "x": 420, "y": 50 },
      "size": { "width": 120, "height": 60 }
    }
  ],
  "connections": [
    {
      "id": "conn-001",
      "from": "elem-003",
      "to": "elem-001",
      "type": "support"
    }
  ],
  "legend": {
    "visible": true,
    "position": { "x": 900, "y": 50 }
  }
}
```

### 6.2 Export Formats

| Format | Use Case | Notes |
|--------|----------|-------|
| PNG | Presentations, quick sharing | Rasterized, specify DPI (default 150) |
| SVG | Publication, editing in Illustrator | Vector, editable |
| PDF | Print, publication | Vector, single page |
| JSON | Save/reload, backup | Native format |

### 6.3 Auto-save
- Local storage auto-save every 60 seconds
- Prompt to recover on reload if unsaved changes detected

---

## 7. Technical Requirements

### 7.1 Platform
- Web-based application
- Works in modern browsers (Chrome, Firefox, Safari, Edge)
- Responsive but optimized for desktop (1280px+ width)
- No server required for basic functionality (runs entirely client-side)

### 7.2 Recommended Tech Stack

**Core:**
- React 18+
- TypeScript
- Vite (build tool)

**Canvas/Diagramming:**
Option A: **Konva.js + react-konva** (recommended)
- Good performance for complex diagrams
- Built-in support for shapes, images, transforms
- Active community

Option B: **Fabric.js**
- More full-featured
- Heavier weight
- Good for complex object manipulation

Option C: **React Flow** (if connection-focused)
- Built for node-based diagrams
- May need customization for varied shapes

**State Management:**
- Zustand or Jotai (lightweight)
- Or React Context for simpler approach

**Styling:**
- Tailwind CSS for UI components
- Inline styles for canvas elements (via canvas library)

**File Handling:**
- html2canvas or canvas library native export for PNG
- svg-export utilities for SVG
- jsPDF for PDF generation

### 7.3 Performance Targets
- Support diagrams with 100+ elements smoothly
- Zoom range: 25% - 400%
- Export resolution up to 300 DPI

---

## 8. Future Enhancements (Out of Scope for V1)

These are NOT required for initial release but noted for potential future development:

1. **Collaboration** - Real-time multi-user editing
2. **Video Integration** - Direct video player with frame capture
3. **Template Library** - Pre-built diagram templates
4. **Transcript Import** - Parse transcript files to auto-suggest elements
5. **Analysis Tools** - Count elements by type, contributor statistics
6. **Cloud Storage** - Save/sync to Google Drive, Dropbox
7. **Version History** - Track changes over time
8. **Presentation Mode** - Step-through animation of argument construction
9. **Desktop App** - Locally installed editor (macOS/Windows) that runs fully offline and can optionally connect to a group library server (team request, 2026-09-21)
10. **Custom File Extension** - Save diagrams under an ETD-specific extension registered to the desktop app, so double-clicking a file opens it in the editor (team request, 2026-09-21)

---

## 9. Acceptance Criteria

### 9.1 Minimum Viable Product (MVP)

The editor is complete when a user can:

- [ ] Create a new diagram
- [ ] Add all element types from Section 2
- [ ] Edit element labels and content
- [ ] Embed images in elements
- [ ] Connect elements with arrows
- [ ] Move and resize elements freely
- [ ] Position teacher support elements adjacent to argument elements
- [ ] Generate a legend/key
- [ ] Save diagram to JSON file
- [ ] Load diagram from JSON file
- [ ] Export diagram to PNG
- [ ] Export diagram to SVG

### 9.2 Quality Requirements

- [ ] Elements render with correct colors, borders, and shapes per spec
- [ ] Dashed borders render correctly (not solid)
- [ ] Cloud shape renders as thought bubble (not rectangle)
- [ ] Text is readable at default zoom
- [ ] Images scale proportionally within elements
- [ ] Arrows connect smoothly to element edges
- [ ] Undo/Redo works for all operations
- [ ] No data loss on save/load cycle

---

## 10. Reference Materials

### 10.1 Key Publications
- Conner, A. (2008). Expanded Toulmin diagrams: A tool for investigating complex activity in classrooms. *Proceedings of PME 32*, Vol. 2, pp. 361-368.
- Conner, A., Singletary, L. M., Smith, R. C., Wagner, P. A., & Francisco, R. T. (2014). Teacher support for collective argumentation. *Educational Studies in Mathematics*, 86(3), 401-429.

### 10.2 Visual References
- Screenshot examples provided show exact styling requirements
- Key box format should match examples exactly

---

## Appendix A: Color Reference

```css
/* Contributor Colors */
--given-data-green: #228B22;
--student-blue: #0000CD;
--joint-purple: #800080;
--implicit-black: #000000;

/* Teacher Support Colors */
--teacher-red: #CC0000;
--question-aqua: #00CED1;
--question-fill: #E0FFFF;
--other-support-gold: #DAA520;
--other-support-fill: #FFFACD;

/* UI Colors */
--canvas-background: #FFFFFF;
--grid-lines: #E5E5E5;
--selection-highlight: #4A90D9;
```

## Appendix B: Element Dimensions (Defaults)

| Element Type | Default Width | Default Height | Min Width | Min Height |
|--------------|---------------|----------------|-----------|------------|
| Argument (rectangle) | 180px | 80px | 100px | 50px |
| Teacher Ellipse | 140px | 60px | 80px | 40px |
| Teacher Rounded Rect | 160px | 50px | 100px | 40px |
| Implicit Cloud | 140px | 60px | 80px | 40px |

## Appendix C: Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Save | Cmd/Ctrl + S |
| Load | Cmd/Ctrl + O |
| Undo | Cmd/Ctrl + Z |
| Redo | Cmd/Ctrl + Shift + Z |
| Delete selected | Delete / Backspace |
| Duplicate | Cmd/Ctrl + D |
| Select All | Cmd/Ctrl + A |
| Deselect | Escape |
| Connect mode | C |
| Zoom In | Cmd/Ctrl + Plus |
| Zoom Out | Cmd/Ctrl + Minus |
| Zoom to Fit | Cmd/Ctrl + 0 |
| Pan (when zoomed) | Space + drag |

---

*End of Requirements Document*

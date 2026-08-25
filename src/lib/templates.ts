import type { BoardObject } from "./objects.ts"
import { STICKY_COLORS } from "./notes.ts"
import { shapePoints } from "./shapes.ts"

/**
 * Starter boards, built to match the source designs.
 *
 * A template is a plain array of BoardObjects — no template model, no stored definitions,
 * no editor. If templates ever need authoring, THIS is the seam to widen.
 *
 * Two things drive the look, and both were wrong in the first version:
 *
 * 1. Template boards open on a LIGHT canvas (set at creation, not here). The designs are
 *    all white paper with a dot grid; on the old dark default the pale frames and pastel
 *    stickies read as a wireframe on tar.
 *
 * 2. Frames are FILLED, not hollow. A card in the designs is a white panel with a hairline
 *    border. An unfilled rectangle is a wireframe of that, which is what made the first
 *    pass look like scaffolding rather than a board.
 *
 * Content is the designs' own text, because a template that says "Theme A" teaches
 * nothing about what belongs there. Everything is ordinary board objects, so the first
 * thing anybody does — select it, retype it, drag it somewhere else — just works.
 */

/** Hairline border on a card, matching the designs' very light rules. */
const EDGE = "#cbd5e1"
/** Panel fill. The designs' cards are white on the near-white canvas. */
const PANEL = "#ffffff"
/** A column or lane ground: a touch grey so it separates from the cards inside it. */
const LANE = "#f1f5f9"
/** Heading and label ink — near-black, for a light canvas. */
const INK = "#0f172a"
/** Secondary label ink. */
const MUTED = "#64748b"
const STROKE_WIDTH = 1.5

const fill = (name: string) =>
  STICKY_COLORS.find((c) => c.name === name)?.fill ?? STICKY_COLORS[0].fill

/** Where a template starts. A board opens with the world origin at the screen's top-left. */
const OX = 180
const OY = 130

/** Monotonic, so paint order matches the order objects are listed. */
let seq = 0
const stamp = () => Date.now() + seq++

function note(
  x: number,
  y: number,
  w: number,
  h: number,
  colorName: string,
  text = "",
): BoardObject {
  return {
    id: crypto.randomUUID(),
    type: "note",
    x,
    y,
    w,
    h,
    color: fill(colorName),
    text,
    createdAt: stamp(),
  } as BoardObject
}

/** A free-floating text label — a `bare` note, where `color` is the ink rather than a fill. */
function label(
  x: number,
  y: number,
  w: number,
  text: string,
  font = 16,
  ink = INK,
): BoardObject {
  return {
    id: crypto.randomUUID(),
    type: "note",
    x,
    y,
    w,
    h: Math.max(font * 1.6, 22),
    color: ink,
    text,
    bare: true,
    font,
    createdAt: stamp(),
  } as BoardObject
}

/** A filled panel: card, lane or frame. */
function panel(
  x: number,
  y: number,
  w: number,
  h: number,
  bg = PANEL,
  text?: string,
  kind: "rect" | "diamond" | "ellipse" = "rect",
): BoardObject {
  return {
    id: crypto.randomUUID(),
    type: "stroke",
    points: shapePoints(kind, x, y, x + w, y + h),
    color: EDGE,
    fill: bg,
    width: STROKE_WIDTH,
    shape: kind,
    ...(text ? { text } : {}),
    createdAt: stamp(),
  } as BoardObject
}

/**
 * A straight arrow: a line from A to B with one solid head at B.
 *
 * No `fill`. Its geometry is the two endpoints — the head is painted from them by the
 * renderer — so a fill here would be a fill on a line, which paints nothing and only
 * misleads the property panel into offering to change it.
 */
function arrow(x0: number, y0: number, x1: number, y1: number): BoardObject {
  return {
    id: crypto.randomUUID(),
    type: "stroke",
    points: shapePoints("arrow", x0, y0, x1, y1),
    color: MUTED,
    width: STROKE_WIDTH,
    shape: "arrow",
    createdAt: stamp(),
  } as BoardObject
}

export type TemplateId =
  | "blank"
  | "brainstorming"
  | "kanban"
  | "mindmap"
  | "swot"
  | "journey"
  | "userflow"
  | "affinity"
  | "persona"
  | "roadmap"
  | "blueprint"
  | "usability"

export const TEMPLATE_IDS: TemplateId[] = [
  "kanban",
  "swot",
  "mindmap",
  "journey",
  "userflow",
  "affinity",
  "persona",
  "roadmap",
  "blueprint",
  "usability",
  "brainstorming",
  "blank",
]

export function isTemplateId(v: unknown): v is TemplateId {
  return typeof v === "string" && (TEMPLATE_IDS as string[]).includes(v)
}

export const TEMPLATE_NAMES: Record<TemplateId, string> = {
  blank: "Untitled board",
  brainstorming: "Brainstorming",
  kanban: "Sprint Kanban Board",
  mindmap: "Mind Map",
  swot: "Strategic Planning SWOT",
  journey: "Customer Journey Map",
  userflow: "User Flow Diagram",
  affinity: "Affinity Map",
  persona: "Persona Profile",
  roadmap: "Campaign Roadmap",
  blueprint: "Service Blueprint",
  usability: "Usability Testing Log",
}

export const TEMPLATE_HINTS: Record<TemplateId, string> = {
  blank: "Start with nothing",
  brainstorming: "Three stickies, ready to fill",
  kanban: "To Do, In Progress, Testing, Done",
  mindmap: "A centre topic and its branches",
  swot: "Strengths, Weaknesses, Opportunities, Threats",
  journey: "Stages against actions, thoughts and emotions",
  userflow: "Screens, a decision and the paths out",
  affinity: "Grouped notes under themes",
  persona: "Profile, goals, pain points and tools",
  roadmap: "Phases across a campaign",
  blueprint: "Frontstage, backstage and support layers",
  usability: "A row per task, with observations",
}

export function templateObjects(id: TemplateId): BoardObject[] {
  switch (id) {
    case "blank":
      return []

    case "brainstorming": {
      const W = 200
      const GAP = 40
      return [
        label(OX, OY - 50, 600, "Brainstorm", 26),
        note(OX, OY, W, W, "Yellow"),
        note(OX + W + GAP, OY, W, W, "Teal"),
        note(OX + (W + GAP) * 2, OY, W, W, "Pink"),
      ]
    }

    case "kanban": {
      const CW = 300
      const CH = 620
      const GAP = 24
      const col = (i: number) => OX + (CW + GAP) * i
      /**
       * Cards first, columns second — because the count badge is DERIVED from this list.
       *
       * The badges used to be hand-written strings and had drifted: "Done" read 12 above
       * a single card. A number that contradicts what is directly beneath it is worse
       * than no number, and the only way it stays true as the seed content changes is if
       * nothing has the chance to write it by hand.
       */
      const cards: { col: number; text: string; tag: string; tone: string }[] = [
        { col: 0, tag: "Bug", tone: "Red", text: "Fix checkout button not responding on mobile" },
        { col: 0, tag: "Feature", tone: "Blue", text: "Add dark mode toggle to settings" },
        { col: 0, tag: "Spike", tone: "Orange", text: "Research pagination libraries for data tables" },
        { col: 1, tag: "Integration", tone: "Purple", text: "Connect payment provider webhook" },
        { col: 1, tag: "UI/UX", tone: "Blue", text: "Redesign empty state illustrations" },
        { col: 2, tag: "Blocked", tone: "Red", text: "Cross-browser testing for signup flow" },
        { col: 3, tag: "Done", tone: "Green", text: "Upgrade build tooling to latest version" },
      ]
      const names = ["To Do", "In Progress", "Testing", "Done"]

      const out: BoardObject[] = [
        label(OX, OY - 60, 700, "Sprint Kanban Board", 26),
      ]
      names.forEach((name, i) => {
        const count = cards.filter((c) => c.col === i).length
        out.push(panel(col(i), OY, CW, CH, LANE))
        out.push(label(col(i) + 20, OY + 18, CW - 80, name, 17))
        out.push(label(col(i) + CW - 46, OY + 18, 30, String(count), 15, MUTED))
      })

      // Cards, as the designs have them: a white panel with the ticket text on it.
      const rows = [0, 0, 0, 0]
      for (const c of cards) {
        const row = rows[c.col]++
        const x = col(c.col) + 16
        const y = OY + 58 + row * 130
        out.push(note(x, y, CW - 32, 26, c.tone, c.tag))
        out.push(panel(x, y + 30, CW - 32, 82, PANEL, c.text))
      }
      return out
    }

    case "mindmap": {
      // Navigation, Visual Identity and Onboarding, each with its own child notes.
      //
      // The content is deliberately generic. It used to describe THIS project's rebrand —
      // a centre node named after it, a "Glassmorphism panels" leaf — which made a
      // template that is meant to be a starting point read as somebody else's finished
      // notes. A seed should show the SHAPE of the method, not the author's own work.
      const CORE_W = 240
      const CORE_H = 120
      const BW = 180
      const BH = 60
      const KW = 170
      const KH = 56
      // Far enough right that the leftward branch's children still clear the tool rail —
      // the first version put them at x=0, tucked underneath it where nothing tells you
      // they are there.
      const cx = OX + 640
      const cy = OY + 300
      const branches = [
        { name: "Navigation", dx: 380, dy: -200, kids: ["Simplify menu structure", "Icon placement"] },
        { name: "Visual Identity", dx: 380, dy: 110, kids: ["Refresh colour palette", "Update logo treatment"] },
        { name: "Onboarding", dx: -440, dy: 110, kids: ["Progressive disclosure"] },
      ]

      // Positions are resolved FIRST, then every arrow is emitted, then every note. The
      // two passes matter: paint order is createdAt, so interleaving them stamps a branch
      // note earlier than a later branch's arrow and that arrow draws over the note.
      const placed = branches.map((b) => {
        const bx = cx + b.dx
        const by = cy + b.dy
        const right = b.dx > 0
        return {
          ...b,
          bx,
          by,
          right,
          kids: b.kids.map((k, i) => ({
            text: k,
            kx: right ? bx + BW + 40 : bx - KW - 40,
            ky: by + i * (KH + 28),
          })),
        }
      })

      const arrows: BoardObject[] = []
      const notes: BoardObject[] = []
      for (const b of placed) {
        arrows.push(arrow(cx, cy, b.bx + (b.right ? 0 : BW), b.by + BH / 2))
        for (const k of b.kids) {
          arrows.push(
            arrow(b.bx + (b.right ? BW : 0), b.by + BH / 2, k.kx + (b.right ? 0 : KW), k.ky + KH / 2),
          )
        }
      }
      notes.push(note(cx - CORE_W / 2, cy - CORE_H / 2, CORE_W, CORE_H, "Purple", "New Product Launch"))
      for (const b of placed) {
        notes.push(note(b.bx, b.by, BW, BH, "Blue", b.name))
        for (const k of b.kids) notes.push(note(k.kx, k.ky, KW, KH, "Grey", k.text))
      }
      return [...arrows, ...notes]
    }

    case "swot": {
      const Q = 460
      const H = 340
      const cells = [
        { x: 0, y: 0, name: "Strengths", notes: [["Yellow", "Market Leader in Core Segment"], ["Blue", "Strong brand recognition among Gen Z"]] },
        { x: 1, y: 0, name: "Weaknesses", notes: [["Pink", "Legacy Tech Debt slowing feature velocity"]] },
        { x: 0, y: 1, name: "Opportunities", notes: [["Green", "New Market Expansion (APAC region)"], ["Yellow", "AI Integration in core workflow"]] },
        { x: 1, y: 1, name: "Threats", notes: [["Pink", "Aggressive pricing from Startup X"]] },
      ] as const
      const out: BoardObject[] = [
        label(OX, OY - 60, 800, "Q4 Strategic Planning SWOT", 26),
      ]
      cells.forEach((c) => {
        const x = OX + c.x * Q
        const y = OY + c.y * H
        out.push(panel(x, y, Q, H, PANEL))
        out.push(label(x + 26, y + 20, Q - 52, c.name, 20))
        c.notes.forEach((n, i) => {
          out.push(note(x + 26 + i * 200, y + 60, 180, 180, n[0], n[1]))
        })
      })
      return out
    }

    case "journey": {
      const stages = ["Awareness", "Consideration", "Purchase"]
      const rows = [
        { name: "Actions", tone: ["Yellow", "Blue", "Green"], text: ["Sees targeted ad on tech blog", "Reads documentation and compares features", "Signs up for free trial"] },
        { name: "Thoughts", tone: ["White", "White", "White"], text: ['"Is this another overhyped tool?"', '"API looks clean, but pricing is confusing."', '"Let\'s see if it actually works."'] },
        { name: "Emotions", tone: ["Grey", "Grey", "Grey"], text: ["Neutral", "Frustrated", "Delighted"] },
      ]
      const LX = OX + 170
      const CW = 300
      const RH = 200
      const out: BoardObject[] = [
        label(OX, OY - 84, 800, "SaaS Onboarding Journey", 26),
        label(OX, OY - 46, 800, "Mapping the user experience from discovery to active usage.", 15, MUTED),
      ]
      stages.forEach((s, i) => {
        out.push(panel(LX + i * CW, OY, CW - 20, 48, LANE, s))
      })
      rows.forEach((r, ri) => {
        const y = OY + 66 + ri * RH
        out.push(label(OX, y + RH / 2 - 20, 150, r.name, 16, MUTED))
        stages.forEach((_, ci) => {
          const x = LX + ci * CW
          out.push(panel(x, y, CW - 20, RH - 20, PANEL))
          out.push(note(x + 20, y + 20, CW - 60, RH - 60, r.tone[ci], r.text[ci]))
        })
      })
      return out
    }

    case "userflow": {
      const NW = 230
      const NH = 120
      const y0 = OY + 160
      const entry = OX
      const screen = entry + NW + 120
      const dec = screen + NW + 120
      const out = dec + 230 + 120
      return [
        arrow(entry + NW, y0 + NH / 2, screen, y0 + NH / 2),
        arrow(screen + NW, y0 + NH / 2, dec, y0 + NH / 2),
        arrow(dec + 230, y0 + NH / 2, out, y0 - 120 + NH / 2),
        arrow(dec + 230, y0 + NH / 2, out, y0 + 220 + NH / 2),
        panel(entry, y0 + 20, NW, 70, LANE, "User Entry", "ellipse"),
        panel(screen, y0, NW, NH, PANEL, "Login Page"),
        label(screen + 16, y0 + 12, NW - 32, "SCREEN", 12, MUTED),
        panel(dec, y0 - 55, 230, 230, PANEL, "Has Account?", "diamond"),
        panel(out, y0 - 120, NW, NH, PANEL, "Dashboard"),
        label(out + 16, y0 - 108, NW - 32, "SCREEN · Yes", 12, MUTED),
        panel(out, y0 + 220, NW, NH, PANEL, "Sign Up"),
        label(out + 16, y0 + 232, NW - 32, "FORM · No", 12, MUTED),
      ]
    }

    case "affinity": {
      const groups = [
        { name: "User Pain Points", tone: "Pink", items: ["Checkout process is too long.", "Can't find the 'Save for Later' button easily.", "Password reset email takes too long to arrive.", "Session times out while I'm reading."] },
        { name: "Feature Ideas", tone: "Green", items: ["Dark mode toggle in quick settings.", "One-click reorder from history.", "Integration with common calendar apps.", "Voice search on mobile web."] },
        { name: "Navigation Issues", tone: "Blue", items: ["Hamburger menu on desktop feels wrong.", "Breadcrumbs disappear on scroll.", "Footer links are too small to tap easily."] },
      ]
      const CW = 340
      const out: BoardObject[] = [label(OX, OY - 60, 900, "Affinity Map Session", 26)]
      groups.forEach((g, gi) => {
        const x = OX + gi * CW
        out.push(label(x, OY, CW - 40, g.name, 19))
        g.items.forEach((t, i) => {
          // Offset alternate notes so a cluster reads as gathered rather than gridded —
          // an affinity map is notes that were MOVED into groups.
          out.push(note(x + (i % 2) * 34, OY + 44 + i * 150, 190, 130, g.tone, t))
        })
      })
      return out
    }

    case "persona": {
      const W = 820
      return [
        panel(OX, OY, W, 170, PANEL),
        note(OX + 22, OY + 22, 126, 126, "Grey"),
        label(OX + 170, OY + 30, W - 200, "Alex the Data Analyst", 24),
        label(OX + 170, OY + 70, W - 200, "A mid-level data analyst who thrives on uncovering patterns in complex datasets.", 14, MUTED),
        label(OX + 170, OY + 116, 240, "AGE 28", 13, MUTED),
        label(OX + 340, OY + 116, 240, "ROLE Senior Analyst", 13, MUTED),
        label(OX + 560, OY + 116, 240, "LOCATION Austin, TX", 13, MUTED),

        panel(OX, OY + 195, 400, 300, PANEL),
        label(OX + 22, OY + 215, 360, "Goals", 19),
        note(OX + 22, OY + 252, 356, 62, "Green", "Reduce time spent on data cleaning by 30%."),
        note(OX + 22, OY + 326, 356, 62, "Green", "Create interactive dashboards for stakeholders quickly."),
        note(OX + 22, OY + 400, 356, 62, "Green", "Integrate disparate data sources seamlessly."),

        panel(OX + 420, OY + 195, 400, 300, PANEL),
        label(OX + 442, OY + 215, 360, "Pain Points", 19),
        note(OX + 442, OY + 252, 356, 62, "Yellow", '"I spend too much time exporting CSVs from one tool to another."'),
        note(OX + 442, OY + 326, 356, 62, "Pink", '"Current tools freeze when I load datasets over 1M rows."'),
        note(OX + 442, OY + 400, 356, 62, "Blue", "Hard to share findings with non-technical execs."),

        panel(OX, OY + 520, W, 130, PANEL),
        label(OX + 22, OY + 540, W - 44, "Tech Stack", 19),
        note(OX + 22, OY + 578, 170, 52, "Blue", "Python"),
        note(OX + 212, OY + 578, 170, 52, "Teal", "MySQL"),
        note(OX + 402, OY + 578, 170, 52, "Orange", "Tableau"),
        note(OX + 592, OY + 578, 200, 52, "Purple", "Google Analytics"),
      ]
    }

    case "roadmap": {
      const phases = [
        { name: "Phase 1: Planning", tone: "Blue", items: [["Strategy Doc", "Finalize target audience personas and key messaging pillars."]] },
        { name: "Phase 2: Pre-Launch", tone: "Purple", items: [["PR Wave 1", "Send embargoed press releases to tier 1 tech media."], ["Email Teaser", "Draft and schedule 'coming soon' blast to waitlist."]] },
        { name: "Launch Day", tone: "Orange", items: [["Product Hunt Launch", "Go live at 12:01 AM PST. Coordinate upvotes."], ["Video Asset", "Maker comment ready."]] },
        { name: "Phase 4: Sustain", tone: "Green", items: [["Retargeting Ads", "Secondary ad set for visitors who didn't convert."]] },
      ]
      const CW = 320
      const out: BoardObject[] = [label(OX, OY - 60, 900, "Campaign Roadmap Q3", 26)]
      phases.forEach((p, i) => {
        const x = OX + i * CW
        out.push(panel(x, OY, CW - 24, 520, LANE))
        out.push(label(x + 18, OY + 18, CW - 60, p.name, 16))
        p.items.forEach((it, j) => {
          const y = OY + 60 + j * 150
          out.push(note(x + 16, y, CW - 56, 130, p.tone, `${it[0]}\n\n${it[1]}`))
        })
      })
      return out
    }

    case "blueprint": {
      const layers = [
        { name: "Physical Evidence", tone: "Grey", cells: ["Landing Page", "Sign-up Form", "Welcome Email"] },
        { name: "User Actions", tone: "Yellow", cells: ["Discovers Service", "Creates Account", "Logs In"] },
        { name: "Frontstage", tone: "Blue", cells: ["Show pricing", "Display Validation Errors", "Load Dashboard UI"] },
        { name: "Backstage", tone: "Purple", cells: ["Serve content", "Process Registration", "Fetch User Data"] },
      ]
      const LX = OX + 210
      const CW = 280
      const RH = 150
      const out: BoardObject[] = [label(OX, OY - 60, 900, "Service Blueprint V2", 26)]
      layers.forEach((l, li) => {
        const y = OY + li * RH
        out.push(label(OX, y + RH / 2 - 16, 190, l.name, 15, MUTED))
        out.push(panel(LX, y, CW * 3, RH - 16, LANE))
        l.cells.forEach((c, ci) => {
          out.push(note(LX + ci * CW + 16, y + 16, CW - 32, RH - 48, l.tone, c))
        })
        // The two dividing lines the method is built on.
        if (l.name === "User Actions") {
          out.push(label(LX, y + RH - 14, 320, "— Line of Interaction —", 12, MUTED))
        }
        if (l.name === "Frontstage") {
          out.push(label(LX, y + RH - 14, 320, "— Line of Visibility —", 12, MUTED))
        }
      })
      return out
    }

    case "usability": {
      const cols = [
        { name: "Task", w: 300 },
        { name: "User", w: 130 },
        { name: "Status", w: 130 },
        { name: "Observations", w: 380 },
      ]
      const rows = [
        ["T1: Find the nearest coffee shop and check opening hours.", "U_001", "Pass", "Found shop quickly, but missed the hours link initially.", "Green"],
        ["T2: Save the route to 'Favorites' for offline access.", "U_002", "Fail", "Could not locate the 'Save' icon. Confused it with 'Share'.", "Red"],
        ["T3: Adjust privacy settings to hide location from friends.", "U_003", "Pass", "Smooth process. Expected location in 'Account' not 'Security'.", "Green"],
      ]
      const RH = 130
      const out: BoardObject[] = [
        label(OX, OY - 84, 900, "Usability Testing Log", 26),
        label(OX, OY - 46, 900, "Project Phoenix — Mobile App Redesign — Q3", 15, MUTED),
      ]
      let hx = OX
      cols.forEach((c) => {
        out.push(panel(hx, OY, c.w - 8, 44, LANE, c.name))
        hx += c.w
      })
      rows.forEach((r, ri) => {
        const y = OY + 56 + ri * RH
        let x = OX
        cols.forEach((c, ci) => {
          out.push(panel(x, y, c.w - 8, RH - 16, PANEL))
          const text = r[ci]
          const tone = ci === 2 ? r[4] : "White"
          if (ci === 2) out.push(note(x + 16, y + 16, c.w - 40, RH - 48, tone, text))
          else out.push(label(x + 16, y + 20, c.w - 40, text, 14))
          // Advance. Without this every cell in the row stacks on the first column —
          // which is exactly what happened, and what the prefer-const lint caught.
          x += c.w
        })
      })
      return out
    }
  }
}

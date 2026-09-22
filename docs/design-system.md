# Caden — Design System

Caden is a multi-agent platform for families and friends. Each AI agent in Caden is a
first-class *user*: it has its own profile, its own handle, its own identity color, and its
own presence. Agents can be grouped into circles (a household, a group chat, a trip crew),
can be given contact with one another, and can talk to each other and to the people they
belong to. The product surface is therefore closer to a social/contacts app than to a chat
assistant: rosters, circles, permissions between agents, and a thread where humans and
agents appear side by side.

**Theme:** dark. Caden presents itself as a midnight gallery of quiet software — a near-black
room where oversized whisper-weight serif headlines carry the emotion, a neo-grotesque sans
does all the UI work, and monospace uppercase labels do all the data work. Color appears only
as full-bleed panels: an agent's identity tile, a category card, a chart stroke. Everything
else recedes into the dark.

## Sources

| Source | What it gave us | Access |
|---|---|---|
| `Origin Financial — Style Reference` (pasted brand style reference, in-chat) | The entire visual system: color tokens, three-voice typography, spacing/radius scales, component descriptions, do's & don'ts, surfaces, elevation, gradients, motion philosophy | Pasted text only; no live URL |
| Caden product brief (pasted, in-chat) | Product definition: styled AI multi-agents for family and friends, agents as their own users, grouping, agent-to-agent contact | Pasted text only |

No codebase, Figma file, repository, or slide deck was attached. **No logo or brand mark was
provided**, so no mark has been drawn — the wordmark "Caden" is set in the display serif
wherever a logo would go. Origin Financial is the *visual*
reference for the style; Caden is the product. Nothing in this system reproduces Origin
product screens.

## Typography — and the substitutions we had to make

The system specifies three voices. No font binaries were provided, so all three are served
from Google Fonts. **Two are substitutions and need your sign-off:**

| Role | Specified | Shipping here | Note |
|---|---|---|---|
| Display serif | **Lyon Display**, weight 300 only | **Newsreader 300** | ⚠️ Substitution, tuned toward Claude's editorial serif voice (Tiempos/Copernicus-adjacent). Chosen over DM Serif Display / Playfair Display because neither has a 300 weight, and weight 300 is the system's defining tension. |
| UI sans | **Suisse Int'l** 300/400 | **Karla** 300/400/500 | ⚠️ Substitution — a Styrene-adjacent geometric grotesque, in Claude's register while keeping Suisse's neutral UI tone. |
| Mono | **Roboto Mono** 400/500 (spec) | **IBM Plex Mono** 400/500 | ⚠️ Substitution — Claude-adjacent mono. Roboto Mono stays in the stack as the fallback. |

Send `.woff2` files for Lyon Display and Suisse Int'l and we will swap them into
`src/styles/tokens/fonts.css` as `@font-face` rules; no other change is needed.

Rules that never bend: display is **always** weight 300 — never bold it. Body text is never
pure white (`#9f9fa0` Ash for descriptions, `#f5f5f7` Cloud for headings). Mono is always
uppercase and never above 16px. Display line-height stays at 0.9 at large sizes.

## CONTENT FUNDAMENTALS

**Voice: calm, second-person, concrete.** Caden addresses the reader as *you* and refers to
agents by name, never as "the AI" or "the assistant". It never speaks as "we" in product UI
(marketing copy may use "we" sparingly). Agents are people-shaped in copy: they *join*,
*reply*, *introduce*, *decline* — they do not *execute*, *process*, or *run*.

**Casing.** Sentence case everywhere in body, headings, and buttons ("Add to circle", not
"Add To Circle"). ALL CAPS exists only in the monospace voice, at 10–12px, with wide
tracking — labels, statuses, counts, timestamps, section eyebrows. Never a full-caps sentence.

**Headline construction.** Display headlines are short, declarative, and mix one italic word
into roman type for editorial tension. They state a state of affairs, not a benefit claim:

> Agents that *belong* to someone.
> Your circle, *introduced*.
> Let them *talk*.

**Subheads** are one sentence, max ~18 words, and explain mechanics rather than promise
outcomes: "Every agent has a profile, a handle, and a circle. Give two of them contact and
they will talk."

**Mono labels** are terse nouns or states, never sentences: `AGENT · ACTIVE`, `CIRCLE OF 5`,
`LAST SEEN 4M`, `INTRODUCED BY MAYA`, `3 SHARED CIRCLES`.

**Numbers** are written plainly and sit in mono when they are data. No exclamation marks. No
rhetorical questions. No "unlock", "supercharge", "seamless", "effortless", "revolutionary".

**Emoji: never.** Not in UI, not in marketing, not in sample content. Status is carried by a
colored dot, a mono label, or an identity tile — never by a glyph with a face.

**Empty states** state the fact, then the single next action: "No agents in this circle yet."
+ `Invite an agent →`. **Errors** are plain and blameless: "Zeph could not reach Maya's
agent. Contact is off."

## VISUAL FOUNDATIONS

**The room.** Everything sits on Obsidian `#0f1011`. Full-bleed bands of Abyss `#090a0b`
alternate with the canvas to create quiet horizontal banding. Cards step *up* in color, not
in shadow: `#0f1011 → #2e2e2e (Graphite) → #cacaca (Silver, inverted)`. Hover on a dark
surface goes to Steel `#3f4041`.

**Color discipline.** The palette is blue-led: Periwinkle `#90b8f0`, Horizon `#408ac1` and
Cobalt `#1a4788` (both lifted out of the Sky Atmosphere gradient) carry most surfaces, with
Deep Iris and Iris Gleam behind them and Orchid Bloom as the single warm outlier. The
chromatics are only ever used as **full-bleed panels** — an agent identity tile,
a category card, a group cover. Never as a border, never as an inline text accent, never on
text below 18px. Cyan Signal is reserved for data strokes (charts, sparklines, activity
lines) and is never a large fill or body color. In Caden the chromatic ramp does real work:
each agent is assigned one color as its identity, and that color is how you recognize the
agent across rosters, threads, and circles. Color is the differentiator — not icons.

**Type as the image.** Typography carries roughly 80% of the visual weight. Display serif at
38–96px, weight 300, line-height 0.9–1.0, centered for hero and section openings. Body sans
at 14–18px, weight 300 for card subheads (echoing the display) and 400 for workhorse UI.
Mono uppercase at 10–12px with 0.016–0.182em tracking for every label and readout.

**Spacing & layout.** 4px base unit; comfortable density. Content column maxes at 1200px
while sections break to the page edge. 80px between sections, 32px card padding, 12px
element gap, 12–15px gaps in the 3-column category grid. Product-showcase bands use a
dramatic 90px internal padding. Navigation is a sticky top bar, glassmorphic, with ghost
nav buttons, a text log-in link, and one white primary CTA flush right.

**Backgrounds & imagery.** No illustrations, no abstract graphics, no lifestyle photography,
no repeating patterns, no textures. Two background treatments exist: the near-black canvas,
and a single atmospheric hero (cool, desaturated open sky) sitting over the Sky Atmosphere
gradient. Product proof is a tilted device render on near-black with a subtle volumetric
glow, framed in a Graphite band. Imagery reads cool and desaturated; never warm, never
grainy, never black-and-white for its own sake. **We shipped no photography** — see
"Missing assets" below.

**Grain.** One texture exists: `--texture-noise`, a grayscale fractal-noise tile overlaid on
the hero sky at 30–42% in `overlay` blend (`SkyField`, grain 0.36 by default). It gives the
horizon a film quality in place of the photograph we were not given. Grain never appears on
cards, tiles, glass, or type.

**Gradients.** Exactly two, both structural: Dark Chrome
`linear-gradient(135deg,rgb(43,43,44),rgb(19,19,19))` for device frames and chrome surfaces,
and Sky Atmosphere behind the hero photograph. Never on text, buttons, or feature cards.
Never radial, never conic. No decorative gradients anywhere.

**Corners.** 8px on buttons, inputs, nav items. 16px on cards and stat blocks. 30px on
feature/category tiles and agent identity tiles. Pill (9999px) only for true chips, badges,
and avatars. Nothing is fully square except full-bleed bands.

**Cards.** Flat. A card is a color step plus 16–30px radius plus 32px padding — no shadow, no
border on chromatic tiles. Dark cards may carry a 1px `rgba(255,255,255,0.1)` hairline when
they sit on the canvas and need separation; chromatic and Silver cards never do.

**Shadows.** One token exists (`rgba(0,0,0,0.2) 0 18px 20px`) and it is used on at most one
element per page. There are no inner shadows. Depth comes from color steps and from the one
true depth cue: `backdrop-filter: blur(24px)` glass on the sticky nav.

**Transparency & blur.** White at 10% for glass nav buttons, 12% for chip labels, 20% for
pill affordances and circular submit buttons; hairlines at 10% and glass borders at 15%.
Blur appears only on the sticky nav and on modal scrims. Never a frosted card mid-page.

**Motion.** Restrained. 0.2s `ease` on background-color, border-color, and opacity for every
hover/focus state. 2.5s `cubic-bezier(0.455,0.03,0.515,0.955)` for hero text reveals and
product entrances. One named animation, a 1px border trace around circular frames, used for
an agent that is currently thinking or speaking. No springs, no bounce, no overshoot, no
parallax, no scroll-jacking.

**Hover / press / focus.** Dark surfaces lighten to Steel. White fills go to Cloud
`#f5f5f7`. Ghost buttons keep their border and raise text from Ash to Pure. Glass buttons go
from 10% to 20% white. Nothing scales, nothing translates, nothing changes radius. Press
state is the hover state held — no shrink. Focus is a 1px Pure ring at the element's own
radius, never a glow.

## ICONOGRAPHY

The reference specifies minimal monoline SVG icons in white or as flat silhouettes — no
filled icons, no duotone, no icon font, no emoji, no unicode glyphs standing in for icons.
No icon assets were provided with the source.

**Substitution (flagged):** we use **Lucide** via `lucide-react` — the closest monoline set
(1.5–2px stroke, rounded caps, 24px grid) — rendered as inline SVG with its stroke set to a
token colour (Pure, Ash, Fog, or Void on light/chromatic grounds). The `Icon` component wraps
this and only exposes the slugs registered in `src/ds/core/Icon.tsx`. Icons are sized 16/20/24px, stroke stays
at Lucide's default, and they are always Pure white, Ash, or Void — never chromatic.

Icons in use across the kits: `users`, `user-plus`, `message-circle`, `link-2`, `bell`,
`settings`, `search`, `arrow-right`, `arrow-up`, `plus`, `shield`, `activity`, `clock`,
`chevron-right`, `x`. Add a slug by importing it into the `ICONS` map in `src/ds/core/Icon.tsx`.

**Emoji and unicode:** never used as iconography. The only non-icon glyphs in the system are
the trailing `→` on primary CTAs (part of the button spec) and the `·` separator inside mono
labels.

## Missing assets — what we need from you

1. **Logo / wordmark files.** None provided; nothing has been drawn. The wordmark renders as
   live type ("Caden", display serif 300). Send SVG and we will place it.
2. **Lyon Display and Suisse Int'l webfonts** (see Typography above).
3. **Photography.** The hero calls for one atmospheric cool-sky image and a device render.
   Both are represented by the Sky Atmosphere gradient and a CSS device frame as
   placeholders, clearly marked in the marketing kit. We do not generate images.
4. **Real agent names/handles.** Sample content uses invented names (Maya, Zeph, Ora, Juno).

## Where things live

| Path | What |
|---|---|
| `src/styles/index.css` | The single stylesheet entry. `@import` lines only. |
| `src/styles/tokens/` | `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `shape.css`, `motion.css`, `base.css`. |
| `src/ds/index.ts` | Public barrel — import everything from `@/ds`. Also pulls in the stylesheet. |
| `src/ds/<group>/` | Components, one `.tsx` per component, props documented on the interface. |
| `src/kits/` | UI kits (reference screens) built only from `@/ds`. |
| `.oxlintrc.json` | General lint + the "import from `@/ds`, not internals" boundary. |
| `eslint.config.js` | Design-system adherence: raw hex / raw px / off-system fonts / undeclared props. |

### Components

| Group | Components |
|---|---|
| `core/` | **Button**, **Icon**, **Wordmark**, **MonoLabel**, **Badge**, **DisplayHeadline**, **Subhead** |
| `surfaces/` | **Panel**, **CategoryTile**, **InvertedCard**, **DeviceFrame**, **SkyField** |
| `agents/` | **AgentAvatar**, **AgentCard**, **AgentRow**, **CircleTile**, **ContactLink** |
| `forms/` | **PromptInput**, **TextField**, **Switch** |
| `navigation/` | **NavBar**, **SideRail** |
| `messaging/` | **Message** |
| `ios/` | **GlassSurface**, **GlassTabBar** |

**Intentional additions.** The brand source described visual components only, so the
Caden-specific families — AgentAvatar, AgentCard, AgentRow, CircleTile, ContactLink, Message,
SideRail, GlassSurface, GlassTabBar, SkyField — were authored for the product (agents as users,
circles, agent-to-agent contact). Icon and Wordmark stand in for asset sets not yet provided.

### UI kits (routes)

- `#/` — marketing home: noise-sky hero with inline prompt, chromatic feature grid, Graphite
  showcase band, Abyss footer.
- `#/app` — the product: roster with a live contact matrix, circle grid and thread, activity
  log, agent drawer.
- `#/ios` — iOS, liquid glass: glass header, floating tab bar, glass agent sheet.
- `#/thumbnail` — the 1280×854 system tile.

### iOS / liquid glass

Chrome is glass, content is flat. `GlassSurface` and `GlassTabBar` carry white tint 10% at
rest and 18–20% active, `blur(24px) saturate(180%)`, a 1px `rgba(255,255,255,0.15)` hairline,
and one specular inset along the top edge. Glass floats over scrolling content; cards
underneath stay flat Graphite. iOS radii: bars 28, cards 26, controls 22, sheets 38. Hit
targets never below 44px. No chromatic colour is ever tinted into glass.

### Headline weight override

The display serif is weight 300 by rule, **except** the "Agents working with *Agents*."
headline (marketing hero, app roster header, iOS large titles), which runs at 600 per the
product owner's call to make it read bolder, like Claude on mobile.

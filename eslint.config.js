// Caden design-system adherence rules, ported from the Claude Design export.
// Flags raw hex/px, off-system fonts, and props/variants a DS component doesn't declare.
// Scoped to consumers (src/kits and future app code); DS internals are exempt.
import tseslint from 'typescript-eslint';

const adherence = [
  "warn",
  {
    "selector": "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
    "message": "Raw hex color \u2014 use a design-system color token via var()."
  },
  {
    "selector": "Literal[value=/\\b\\d+px\\b/]",
    "message": "Raw px value \u2014 use a design-system spacing token via var()."
  },
  {
    "selector": "Literal[value=/font-family\\s*:\\s*(?!['\\\"]?(?:Newsreader|Karla|IBM Plex Mono))/i]",
    "message": "Font not provided by the design system. Available: Newsreader, Karla, IBM Plex Mono."
  },
  {
    "selector": "JSXOpeningElement[name.name='AgentAvatar'] > JSXAttribute > JSXIdentifier[name!=/^(?:name|tone|size|active|shape|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<AgentAvatar> doesn't accept that prop. Declared props: name, tone, size, active, shape, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='AgentAvatar'] > JSXAttribute[name.name='shape'] > Literal[value!=/^(?:pill|tile)$/]",
    "message": "<AgentAvatar> shape must be one of 'pill' | 'tile'."
  },
  {
    "selector": "JSXOpeningElement[name.name='AgentCard'] > JSXAttribute > JSXIdentifier[name!=/^(?:name|handle|tone|role|status|belongsTo|selected|onClick|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<AgentCard> doesn't accept that prop. Declared props: name, handle, tone, role, status, belongsTo, selected, onClick, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='AgentRow'] > JSXAttribute > JSXIdentifier[name!=/^(?:name|tone|meta|trailing|active|selected|onClick|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<AgentRow> doesn't accept that prop. Declared props: name, tone, meta, trailing, active, selected, onClick, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='Badge'] > JSXAttribute > JSXIdentifier[name!=/^(?:variant|tone|children|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<Badge> doesn't accept that prop. Declared props: variant, tone, children, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='Badge'] > JSXAttribute[name.name='variant'] > Literal[value!=/^(?:chip|eyebrow|quiet|solid)$/]",
    "message": "<Badge> variant must be one of 'chip' | 'eyebrow' | 'quiet' | 'solid'."
  },
  {
    "selector": "JSXOpeningElement[name.name='Button'] > JSXAttribute > JSXIdentifier[name!=/^(?:variant|arrow|icon|disabled|as|href|children|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<Button> doesn't accept that prop. Declared props: variant, arrow, icon, disabled, as, href, children, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='Button'] > JSXAttribute[name.name='variant'] > Literal[value!=/^(?:primary|ghost|glass|pill|text)$/]",
    "message": "<Button> variant must be one of 'primary' | 'ghost' | 'glass' | 'pill' | 'text'."
  },
  {
    "selector": "JSXOpeningElement[name.name='CategoryTile'] > JSXAttribute > JSXIdentifier[name!=/^(?:tone|icon|title|description|footer|children|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<CategoryTile> doesn't accept that prop. Declared props: tone, icon, title, description, footer, children, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='CircleTile'] > JSXAttribute > JSXIdentifier[name!=/^(?:name|tone|members|note|onClick|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<CircleTile> doesn't accept that prop. Declared props: name, tone, members, note, onClick, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='ContactLink'] > JSXAttribute > JSXIdentifier[name!=/^(?:from|to|state|note|children|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<ContactLink> doesn't accept that prop. Declared props: from, to, state, note, children, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='ContactLink'] > JSXAttribute[name.name='state'] > Literal[value!=/^(?:on|pending|off)$/]",
    "message": "<ContactLink> state must be one of 'on' | 'pending' | 'off'."
  },
  {
    "selector": "JSXOpeningElement[name.name='DeviceFrame'] > JSXAttribute > JSXIdentifier[name!=/^(?:tilt|width|children|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<DeviceFrame> doesn't accept that prop. Declared props: tilt, width, children, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='DisplayHeadline'] > JSXAttribute > JSXIdentifier[name!=/^(?:size|align|tone|as|children|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<DisplayHeadline> doesn't accept that prop. Declared props: size, align, tone, as, children, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='DisplayHeadline'] > JSXAttribute[name.name='size'] > Literal[value!=/^(?:hero|section|card)$/]",
    "message": "<DisplayHeadline> size must be one of 'hero' | 'section' | 'card'."
  },
  {
    "selector": "JSXOpeningElement[name.name='DisplayHeadline'] > JSXAttribute[name.name='align'] > Literal[value!=/^(?:left|center|right)$/]",
    "message": "<DisplayHeadline> align must be one of 'left' | 'center' | 'right'."
  },
  {
    "selector": "JSXOpeningElement[name.name='DisplayHeadline'] > JSXAttribute[name.name='as'] > Literal[value!=/^(?:h1|h2|h3|div)$/]",
    "message": "<DisplayHeadline> as must be one of 'h1' | 'h2' | 'h3' | 'div'."
  },
  {
    "selector": "JSXOpeningElement[name.name='GlassSurface'] > JSXAttribute > JSXIdentifier[name!=/^(?:as|variant|radius|tint|blur|padding|floating|children|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<GlassSurface> doesn't accept that prop. Declared props: as, variant, radius, tint, blur, padding, floating, children, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='GlassSurface'] > JSXAttribute[name.name='variant'] > Literal[value!=/^(?:bar|card|pill|button|sheet)$/]",
    "message": "<GlassSurface> variant must be one of 'bar' | 'card' | 'pill' | 'button' | 'sheet'."
  },
  {
    "selector": "JSXOpeningElement[name.name='GlassTabBar'] > JSXAttribute > JSXIdentifier[name!=/^(?:items|active|onSelect|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<GlassTabBar> doesn't accept that prop. Declared props: items, active, onSelect, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='Icon'] > JSXAttribute > JSXIdentifier[name!=/^(?:name|size|tone|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<Icon> doesn't accept that prop. Declared props: name, size, tone, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='Icon'] > JSXAttribute[name.name='tone'] > Literal[value!=/^(?:pure|ash|muted|dark)$/]",
    "message": "<Icon> tone must be one of 'pure' | 'ash' | 'muted' | 'dark'."
  },
  {
    "selector": "JSXOpeningElement[name.name='InvertedCard'] > JSXAttribute > JSXIdentifier[name!=/^(?:stat|title|children|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<InvertedCard> doesn't accept that prop. Declared props: stat, title, children, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='Message'] > JSXAttribute > JSXIdentifier[name!=/^(?:author|tone|kind|time|children|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<Message> doesn't accept that prop. Declared props: author, tone, kind, time, children, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='Message'] > JSXAttribute[name.name='kind'] > Literal[value!=/^(?:agent|you|system)$/]",
    "message": "<Message> kind must be one of 'agent' | 'you' | 'system'."
  },
  {
    "selector": "JSXOpeningElement[name.name='MonoLabel'] > JSXAttribute > JSXIdentifier[name!=/^(?:size|tone|weight|children|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<MonoLabel> doesn't accept that prop. Declared props: size, tone, weight, children, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='MonoLabel'] > JSXAttribute[name.name='size'] > Literal[value!=/^(?:tiny|micro|label)$/]",
    "message": "<MonoLabel> size must be one of 'tiny' | 'micro' | 'label'."
  },
  {
    "selector": "JSXOpeningElement[name.name='NavBar'] > JSXAttribute > JSXIdentifier[name!=/^(?:items|active|onSelect|trailing|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<NavBar> doesn't accept that prop. Declared props: items, active, onSelect, trailing, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='Panel'] > JSXAttribute > JSXIdentifier[name!=/^(?:level|radius|padding|children|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<Panel> doesn't accept that prop. Declared props: level, radius, padding, children, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='Panel'] > JSXAttribute[name.name='level'] > Literal[value!=/^(?:canvas|sunken|card|chrome)$/]",
    "message": "<Panel> level must be one of 'canvas' | 'sunken' | 'card' | 'chrome'."
  },
  {
    "selector": "JSXOpeningElement[name.name='PromptInput'] > JSXAttribute > JSXIdentifier[name!=/^(?:placeholder|value|onChange|onSubmit|addressing|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<PromptInput> doesn't accept that prop. Declared props: placeholder, value, onChange, onSubmit, addressing, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='SideRail'] > JSXAttribute > JSXIdentifier[name!=/^(?:sections|active|onSelect|footer|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<SideRail> doesn't accept that prop. Declared props: sections, active, onSelect, footer, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='SkyField'] > JSXAttribute > JSXIdentifier[name!=/^(?:grain|children|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<SkyField> doesn't accept that prop. Declared props: grain, children, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='Subhead'] > JSXAttribute > JSXIdentifier[name!=/^(?:tone|align|maxWidth|children|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<Subhead> doesn't accept that prop. Declared props: tone, align, maxWidth, children, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='Subhead'] > JSXAttribute[name.name='align'] > Literal[value!=/^(?:left|center)$/]",
    "message": "<Subhead> align must be one of 'left' | 'center'."
  },
  {
    "selector": "JSXOpeningElement[name.name='Switch'] > JSXAttribute > JSXIdentifier[name!=/^(?:checked|onChange|disabled|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<Switch> doesn't accept that prop. Declared props: checked, onChange, disabled, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='TextField'] > JSXAttribute > JSXIdentifier[name!=/^(?:label|hint|value|onChange|placeholder|type|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<TextField> doesn't accept that prop. Declared props: label, hint, value, onChange, placeholder, type, style."
  },
  {
    "selector": "JSXOpeningElement[name.name='Wordmark'] > JSXAttribute > JSXIdentifier[name!=/^(?:size|tone|style|key|ref|className|children|on[A-Z]\\w*|aria-[\\w-]+)$/]",
    "message": "<Wordmark> doesn't accept that prop. Declared props: size, tone, style."
  }
];

export default tseslint.config({
  files: ['src/**/*.{ts,tsx}'],
  ignores: ['src/ds/**', 'src/kits/ios/IOSDevice.tsx'],
  languageOptions: { parser: tseslint.parser },
  rules: { 'no-restricted-syntax': adherence },
});

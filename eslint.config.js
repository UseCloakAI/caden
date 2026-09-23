// Caden design-system adherence rules, ported from the Claude Design export.
// Flags raw hex/px, off-system fonts, and variant values a DS component doesn't declare.
// Prop names are left to TypeScript, which knows about pass-through HTML attributes.
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
    "selector": "JSXOpeningElement[name.name='AgentAvatar'] > JSXAttribute[name.name='shape'] > Literal[value!=/^(?:pill|tile)$/]",
    "message": "<AgentAvatar> shape must be one of 'pill' | 'tile'."
  },
  {
    "selector": "JSXOpeningElement[name.name='Badge'] > JSXAttribute[name.name='variant'] > Literal[value!=/^(?:chip|eyebrow|quiet|solid)$/]",
    "message": "<Badge> variant must be one of 'chip' | 'eyebrow' | 'quiet' | 'solid'."
  },
  {
    "selector": "JSXOpeningElement[name.name='Button'] > JSXAttribute[name.name='variant'] > Literal[value!=/^(?:primary|ghost|glass|pill|text)$/]",
    "message": "<Button> variant must be one of 'primary' | 'ghost' | 'glass' | 'pill' | 'text'."
  },
  {
    "selector": "JSXOpeningElement[name.name='ContactLink'] > JSXAttribute[name.name='state'] > Literal[value!=/^(?:on|pending|off)$/]",
    "message": "<ContactLink> state must be one of 'on' | 'pending' | 'off'."
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
    "selector": "JSXOpeningElement[name.name='GlassSurface'] > JSXAttribute[name.name='variant'] > Literal[value!=/^(?:bar|card|pill|button|sheet)$/]",
    "message": "<GlassSurface> variant must be one of 'bar' | 'card' | 'pill' | 'button' | 'sheet'."
  },
  {
    "selector": "JSXOpeningElement[name.name='Icon'] > JSXAttribute[name.name='tone'] > Literal[value!=/^(?:pure|ash|muted|dark|current)$/]",
    "message": "<Icon> tone must be one of 'pure' | 'ash' | 'muted' | 'dark' | 'current'."
  },
  {
    "selector": "JSXOpeningElement[name.name='Message'] > JSXAttribute[name.name='kind'] > Literal[value!=/^(?:agent|you|system)$/]",
    "message": "<Message> kind must be one of 'agent' | 'you' | 'system'."
  },
  {
    "selector": "JSXOpeningElement[name.name='MonoLabel'] > JSXAttribute[name.name='size'] > Literal[value!=/^(?:tiny|micro|label)$/]",
    "message": "<MonoLabel> size must be one of 'tiny' | 'micro' | 'label'."
  },
  {
    "selector": "JSXOpeningElement[name.name='Panel'] > JSXAttribute[name.name='level'] > Literal[value!=/^(?:canvas|sunken|card|chrome)$/]",
    "message": "<Panel> level must be one of 'canvas' | 'sunken' | 'card' | 'chrome'."
  },
  {
    "selector": "JSXOpeningElement[name.name='Subhead'] > JSXAttribute[name.name='align'] > Literal[value!=/^(?:left|center)$/]",
    "message": "<Subhead> align must be one of 'left' | 'center'."
  }
];

export default tseslint.config({
  files: ['src/**/*.{ts,tsx}'],
  ignores: ['src/ds/**', 'src/kits/ios/IOSDevice.tsx'],
  languageOptions: { parser: tseslint.parser },
  rules: { 'no-restricted-syntax': adherence },
});

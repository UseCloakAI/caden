---
name: caden-design
description: Use this skill to build well-branded interfaces and assets for Caden, either for production or throwaway prototypes/mocks. Contains design guidelines, colors, type, fonts, and React components for the Caden multi-agent platform.
user-invocable: true
---

Read `docs/design-system.md`, then explore `src/styles/tokens/` and `src/ds/`.

- **Production code:** compose screens only from `@/ds` components and CSS tokens (`var(--…)`).
  No raw hex, raw px, or off-system fonts; run `npm run lint` to check adherence. Use
  `src/kits/` as reference for layout and composition.
- **Throwaway artifacts** (slides, mocks, prototypes): copy the token CSS out and build static
  HTML that follows the same rules.
- If invoked with no other guidance, ask what the user wants to build, ask a few questions,
  and act as an expert designer who outputs HTML artifacts or production code as needed.

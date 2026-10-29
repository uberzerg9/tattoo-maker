# Design mockups

Reference mockups for the MVP screens, exported from the design canvas.
These are NOT production code — they use a proprietary mockup runtime (`support.js`, `<x-dc>`, `{{holes}}`, `DCLogic`) and won't run standalone.
Use them as the source of truth for layout, colors, fonts, spacing, copy and i18n strings, and rebuild the UI in React.

| File | Screen |
| --- | --- |
| Main.dc.html | Workspace: full-screen skin sheet, floating sticker panels (Cartridges, Ink caps, Machine, Skin, Stencil), bottom toolbar (tool, stencil, fresh/healed, zoom, rotate), profile popover. Contains EN/RU/RO strings in `I18N`. |
| Stencil.dc.html | Stencil transfer dialog: original vs stencil preview, threshold, line weight, size on skin. |
| Login.dc.html | Log in |
| Signup.dc.html | Sign up with password strength, experience level, language |
| Profile.dc.html | Profile: card, stats, saved works, settings (account, language, workspace defaults, danger zone). Contains EN/RU/RO strings. |

Design tokens:
- Background #161616 with grip-tape dot pattern; panels #F4F4F0; ink/text/borders #0E0E0E
- Accents: lime #C8FF2E, pink #FF4FB0, blue #4D6BFF, yellow #FFE14D, lilac #C9B8FF, danger #A1124F
- Stencil lines #6A3FB5
- Skin tones: #F3D9C6, #E6C3A7, #D1A07A, #A87452, #7A4E33, #4E3122
- Panels: 3px #0E0E0E border, radius 14px, hard shadow 6px 6px 0 #0E0E0E, slight rotation (±1°)
- Buttons: 2px border, radius 10px, min height 40–44px
- Fonts: Unbounded 500/700/900 (headings, numbers, buttons), Rubik 400/500/700 (body)

# Events page and Experiences map planner — design boards (5 Oct 2026)

19 `.dc.html` artboards and the `canvas.json` that lays them out. Committed so the rulings in
`docs/planning/briefs/experiences-map-planner.md` cite boards anyone can open (the
`console-brief/README.md` precedent).

**Canvas of record:** claude.ai artifact `EsdEL7d7t3kQfgacAYSq2k` ("Events page redesign"), version 19.
These files are that canvas's content at that version; later edits in the canvas editor are not
mirrored here.

**Reading the files.** Each board is one self-contained template plus a script. `{{ holes }}` are
filled by `renderVals()` in the script at the bottom of the file, which also holds the mock data and
the click behaviour. `<sc-for>` repeats, `<sc-if>` shows or hides. The boards need the canvas runtime
(`support.js`) to render, so read them as source.

**Images.** `/_blob/<id>` references are canvas-hosted copies. The city photos are the repo's own
(`client/public/images/landing/`, `client/public/images/moments/`, credits in each folder's
`ATTRIBUTION.json`). The two maps are in `assets/`: `kyoto-map.svg` was drawn from
`server/geo/kyoto-geography.ts` (© OpenStreetMap contributors); `world-map.svg` is Natural Earth land.

**Placeholders.** Text in `[brackets]` is a placeholder for content the mock does not invent: venue,
vendor and stay names, expert notes, checked dates. Do not ship bracketed text.

## Boards

Status: **ruled** = Leon ruled it on 5 Oct 2026. **drawn** = on the canvas, not ruled; do not build
from it until it is. Row numbers follow the canvas.

| Row | File | Shows | Status |
|---|---|---|---|
| 1 | `ExperienceMap.dc.html`, `ExperienceMapMobile.dc.html` | Trip map planner: Browse / Your plan, AI button states, guest sign-in gate, free draft with straight lines, tier rows, pets (party line, border note, "Pets welcome" filter, paw badge) | **ruled** (map planner, Plan with AI, pets). Ask AI drawer and Optimize comparison are not drawn. |
| 1 | `EventPlanner.dc.html`, `EventPlannerMobile.dc.html` | Wedding: venue first, vendors as area rings, run of show, roles to hire, guest tools, Ready-Made and expert slots | **drawn** |
| 1 | `ProposalPlanner.dc.html`, `ProposalPlannerMobile.dc.html` | Proposal: the spot first, hidden plan, the evening | **drawn** |
| 1 | `CelebrationPlanner.dc.html`, `CelebrationPlannerMobile.dc.html` | Birthday: the venue, the day hour by hour, guests, budget | **drawn** |
| 2 | `Experiences.dc.html`, `ExperiencesMobile.dc.html` | Experiences starting state: five groups, then occasions; Where on the world map and city cards | **ruled** (groups first; entry folded into the map) |
| 2 | `PlanModal.dc.html` | Pop-up step 1, the same picker | **ruled** |
| 2 | `PlanModalWhen.dc.html`, `PlanModalWhenMobile.dc.html` | Pop-up step 3: range or one day, the main moment | **drawn**; mirrors the existing modal's occasion-shaped rules |
| 2 | `PlanModalWho.dc.html`, `PlanModalWhoMobile.dc.html` | Pop-up step 4: party, "Bringing a pet?", the three finishes | pet question **ruled**; the rest **drawn** |
| 3 | `Main.dc.html`, `Mobile.dc.html` | Events page: calendar as the stage, Month / Week / Day, What's on, Where to go | **ruled** (events first, keep Week, vibe filters and best-time section stay) |
| 3 | `EventDetail.dc.html`, `EventDetailMobile.dc.html` | Event detail on our own site: locals' notes, traveler comments, organizer facts | page **ruled**; comment moderation and who may comment **not ruled** |

## Mocked, not designed

- Search boxes do not filter.
- "Next" and the three finishes jump to a drawn planner board; nothing is created.
- Tabs marked "Not filled in this mock" are stubs.
- Buttons for Ask AI, Optimize, Finalize, tool chips and "Open list view" do nothing.
- Dates are fixed around "today" = 5 Oct 2026.

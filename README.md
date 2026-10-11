# Hero Deck

A character tracker for fifth edition (2024 rules / SRD 5.2.1). Static web app: no server, no accounts.
Characters live in the browser's localStorage; Export/Import JSON moves them between devices.

## Let your AI assistant write your hero

You do not have to type a whole character into the app. Give the guide to the AI assistant you already use
(ChatGPT, Claude, Gemini...) and it will ask you about your hero and write the file for you.

1. Get the guide: **[AI-GUIDE.md](https://raw.githubusercontent.com/Itram05/DnD-Character-Manager/master/AI-GUIDE.md)**
   (the link opens the plain text: save the page, or select all and copy).
2. Start a new chat with your assistant. Attach the file, or paste the text, and write something like:
   *"Read this guide and help me make my character."* Write in your own language; the assistant will answer in it.
   If you have your sheet as a PDF or a photo, send it in the same message: you will be asked far fewer questions.
3. Answer its questions. At the end you get a `.json` file (or the text of one, to save as `your-hero.json`).
4. Open the app, press **Import JSON** and choose the file. The dialog should say "The file is clean".
   If it lists adjustments instead, copy them back to the assistant and it will fix the file.

To change the hero later the same way: press **Export JSON** in the app and give the assistant that fresh file together
with the guide. The app runs on the 2024 rules; if your table plays the 2014 rules, tell the assistant at the start.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run build      # static site in dist/ (relative paths, works from a sub-folder such as GitHub Pages)
npm run preview    # serve dist/ at http://localhost:4173
```

A few tests in `tests/` check the owner's own character files. Those files are not in the repo, so the tests are
skipped unless their paths are set: `OWNER_GRAV_FILE` and `OWNER_GRAV_COPY_FILE`, in the environment or in a
git-ignored `.env.test.local` (one `NAME=path` per line). A path that is set but missing fails the test.
`OWNER_FILES=skip npm test` skips them on purpose. Details: `tests/ownerFiles.ts`.

## Offline use and updates

The built app can be installed on a phone's home screen (`public/manifest.webmanifest`, icons in `public/icons/`) and
opens with no network: a service worker (`pwa/sw.js`, written to `dist/sw.js` by `pwa/plugin.ts` at the end of the
build) keeps every file of the build in the browser, the rules and spell data included. `npm run dev` has no service
worker and caches nothing.

Characters (localStorage) and pictures (IndexedDB) are not part of it: no version of the worker reads or clears them.

**A new version** (a push to `master`) reaches a player like this:

1. The browser re-checks `sw.js` when the app is opened, and again when it comes back to the front after an hour or
   more. A changed `sw.js` downloads the whole new build in the background. Every file is checked against the hash
   the build wrote into `sw.js`; a build that cannot be downloaded whole is dropped and tried again next time.
2. The new build waits. The page in use keeps the version it started with, so nothing changes under a game in
   progress. A small "New version ready · Reload" row appears in the corner; ✕ hides it.
3. It is applied by **Reload** on that row, or by itself the next time the app is opened.

Each build has its own cache (`hero-deck-<version>`, the version being a hash of the build's files); the old one is
deleted when the new one takes over.

**The way back**, if the worker ever misbehaves: set `OFFLINE = false` in `vite.config.ts` and publish. The build
then writes a `sw.js` that deletes the caches and unregisters itself in every browser that has it, and the page stops
registering one. Leave it like that for a few weeks before removing the code, since a browser only gets the off
switch when it next opens the site with a network.

For one browser only: its site settings → clear site data removes the worker **and the characters**, so export first.
In Chrome on a computer, DevTools → Application → Service workers → Unregister removes the worker alone.

Checked by `tests/offline.test.tsx` (the worker against a fake browser) and by hand in Chrome: reload with the
server stopped, a second build while the first is open, Reload, the off switch.

## Where things are

| Path | What |
|---|---|
| `src/model/` | Data model and rules, no React: `types.ts` (the format), `normalize.ts` (forgiving import), `rules.ts` (all calculations), `rest.ts`, `levelup.ts`, `xp.ts` (experience), `timers.ts` (day timers), `play.ts` (cards, mana, casting), `sorcery.ts` (Sorcery Points, Flexible Casting), `expr.ts` (formulas), `storage.ts` |
| `src/model/images.ts`, `imageStore.ts` | Maps and other pictures of a character: the list is on the character, the pictures are in IndexedDB and travel inside the exported file (see `images` in SCHEMA.md). |
| `src/model/mapMarks.ts`; `src/ui/MapMarks.tsx`, `MapTools.tsx` | What the player marks on a map: pins, routes (with a length once the map has a scale) and tokens. Fields of the image's own entry, placed relative to the picture (0..1), drawn over it at one size at every zoom. The viewer (`ImageViewer.tsx`) opens for looking; "Edit map" turns editing on. Layers and sizes are `preferences.maps` (`prefs.ts`). See "Marks on a map" in SCHEMA.md. |
| `src/model/creatures.ts`; `src/ui/Creatures.tsx`, `CreatureEditor.tsx`, `StatBlock.tsx` | Creatures the hero leads, rides or summons. A stat block is written once and the creatures of it in play are a list inside it, each with its own Hit Points, conditions and spent uses (`creatures` in SCHEMA.md). Every number of a stat block is typed by hand: nothing is worked out from an edition's rules. A section of Play and a tab of its own; which of the two, what a row shows and what a rest does are `preferences.creatures`. |
| `src/ui/` | React screens. `PlayView.tsx` + `GameCard.tsx` are the card table. |
| `src/i18n/en.ts` | Every UI string. Add `bg.ts` with the same keys to translate. |
| `src/content/rulesHelp.en.ts` | Hand-written rules summaries (turn, 2014 → 2024). |
| `src/data/srd/*.json` | Rules data generated from SRD 5.2.1 by `scripts/build-srd-data.mjs`. |
| `src/data/srdPresets.ts` | Hand-checked uses/activation for SRD class features. |
| `pwa/`, `src/pwa.ts`, `src/ui/UpdateBar.tsx` | Offline use: the service worker and the build step that fills it in; the page's side (registration, when an update is applied); the "New version ready" row. |
| `SCHEMA.md`, `examples/` | Character file format and a full example. |
| `AI-GUIDE.md` | The same format explained to a player's AI assistant, which sees nothing else: how to interview the player, every field, the traps, and a full example (`examples/ai-guide-example.json`). `tests/aiGuide.test.ts` fails when the guide and the importer drift apart; a new field goes into `types.ts`, `normalize.ts`, `SCHEMA.md` and the guide together. |

## The play screen

Every active feature, prepared spell, attack and usable item is a **card** in a hand for its action type
(Action / Bonus / Reaction / Free). Using the last charge **taps** the card (turned sideways, darkened);
Short and Long Rest **untap** what they restore. Spell slots are **mana**; casting from a card asks which slot pays.
Passive features lie on the **Always on** strip. Concentration sits in its own slot. Cards ↔ List toggle for dense sheets and the **funnel** filter sit in the sticky head under the HP bar, so they stay at hand while scrolling (on a computer next to the tabs; a phone keeps its tab bar at the bottom).
The funnel filters by hand (Action / Bonus / Reaction / Free), kind (Attacks / Features / Spells / Items), category, damage type, properties and your own tags; the active filters show as chips with ✕ in the same head. The Spells tab has the same funnel, with the hand read from the casting time.
Healing potions (Potion of Healing, Greater, Superior, Supreme; items without `charges`) are compact − / + counters in the Concentration panel, with the dice from the description or the standard ones; tap the name for what it does. All four kinds are always shown: one you do not have is ×0, and its + creates the item in Gear (standard name, dice in the description, quantity 1). Spell scrolls (items without `charges` with "scroll" in the name, e.g. "Scroll of Shatter", "Spell Scroll (Shatter)") are a group right under the spells in each hand: the spell text comes from your spell list, else from the SRD, else from the item's own description; "Use" spends one. Other potions (Climbing, Water Breathing...) are cards in the same group, which is then called "Scrolls & Potions". Other items with `activation` but no `charges` have − / + for their quantity on the card.
Sorcery Points sit under the spell slots; **Convert** opens Flexible Casting (slot → points, points → slot).
Created slots show as `+1` next to the level and vanish on a Long Rest.
Gear: items are kept in **containers** you make (Backpack, Bag of Holding, a mount, a chest at home), each with an icon, a colour, an optional weight limit and a "not carried" switch; a container can be an item (the Bag of Holding item) and then sits wherever that item is. The ⇄ button on an item moves, splits or merges its stack. The carried weight leaves out what is in "not carried" containers (equipped items always count); a Bag of Holding inside another, or a container over its limit, is a warning. Categories (Weapons, Potions...) can be renamed and you can add your own; "How the list looks" groups the list by container, category or not at all and picks the details a row shows. Older files get one Backpack with everything in it. File format: [SCHEMA.md](SCHEMA.md#containers).

Crafting (Gear): **recipes** you write yourself, each taking items by name ("2 Moonpetal" counts every Moonpetal stack in every container) and making an item; "Start from an example" adds an editable one. **Craft ×N** shows how many times you can make it and exactly what is missing, puts the result into the container you pick, and is one change, so Undo (↶) takes the whole craft back. Time, tool, check and note are free text. Any item can be pinned (📌 on its row) as a **counter** in Play with − and +. File format: [SCHEMA.md](SCHEMA.md#recipes).
Quick navigation: on a wide screen a narrow column beside the cards lists the sections on screen right now (slots, Concentration, Always on, each hand and the kinds in it, with card counts), stays in place while scrolling and marks where you are; a tap scrolls there. Narrower screens and phones get a **§** button in the sticky head that opens the same list. Both follow the funnel: a hand the filter empties is not listed. Sections that stand side by side (Bonus, Reaction and Free; the top row of panels) are one entry, since they start at the same height; on a narrow screen, where they stand one under another, they are separate again. The column folds away with the arrow on its edge: the cards then take the full width and only a small tab on the screen's edge brings it back.

## Rules data and license

Rules text comes from the **System Reference Document 5.2.1** (Wizards of the Coast, CC-BY-4.0),
via the Markdown transcription https://github.com/downfallx/dnd-5e-srd-markdown (CC-BY-4.0).
To regenerate: clone that repo and run `node scripts/build-srd-data.mjs <path>`.
The tests check the parsed class tables against the official multiclass spell-slot table.

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC,
available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0
International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Compatible with fifth edition. Not affiliated with or endorsed by Wizards of the Coast.

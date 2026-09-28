# Hero Deck

A character tracker for fifth edition (2024 rules / SRD 5.2.1). Static web app: no server, no accounts.
Characters live in the browser's localStorage; Export/Import JSON moves them between devices.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run build      # static site in dist/ (relative paths, works from a sub-folder such as GitHub Pages)
npm run preview    # serve dist/ at http://localhost:4173
```

## Where things are

| Path | What |
|---|---|
| `src/model/` | Data model and rules, no React: `types.ts` (the format), `normalize.ts` (forgiving import), `rules.ts` (all calculations), `rest.ts`, `levelup.ts`, `play.ts` (cards, mana, casting), `sorcery.ts` (Sorcery Points, Flexible Casting), `expr.ts` (formulas), `storage.ts` |
| `src/ui/` | React screens. `PlayView.tsx` + `GameCard.tsx` are the card table. |
| `src/i18n/en.ts` | Every UI string. Add `bg.ts` with the same keys to translate. |
| `src/content/rulesHelp.en.ts` | Hand-written rules summaries (turn, 2014 → 2024). |
| `src/data/srd/*.json` | Rules data generated from SRD 5.2.1 by `scripts/build-srd-data.mjs`. |
| `src/data/srdPresets.ts` | Hand-checked uses/activation for SRD class features. |
| `SCHEMA.md`, `examples/` | Character file format and a full example. |

## The play screen

Every active feature, prepared spell, attack and usable item is a **card** in a hand for its action type
(Action / Bonus / Reaction / Free). Using the last charge **taps** the card (turned sideways, darkened);
Short and Long Rest **untap** what they restore. Spell slots are **mana**; casting from a card asks which slot pays.
Passive features lie on the **Always on** strip. Concentration sits in its own slot. Cards ↔ List toggle for dense sheets and the **funnel** filter sit in the sticky head under the HP bar, so they stay at hand while scrolling (on a computer next to the tabs; a phone keeps its tab bar at the bottom).
The funnel filters by hand (Action / Bonus / Reaction / Free), kind (Attacks / Features / Spells / Items), category, damage type, properties and your own tags; the active filters show as chips with ✕ in the same head. The Spells tab has the same funnel, with the hand read from the casting time.
Healing potions (Potion of Healing, Greater, Superior, Supreme; items without `charges`) are compact − / + counters in the Concentration panel, with the dice from the description or the standard ones; tap the name for what it does. Spell scrolls (items without `charges` with "scroll" in the name, e.g. "Scroll of Shatter", "Spell Scroll (Shatter)") are a group right under the spells in each hand: the spell text comes from your spell list, else from the SRD, else from the item's own description; "Use" spends one. Other potions (Climbing, Water Breathing...) are cards in the same group, which is then called "Scrolls & Potions". Other items with `activation` but no `charges` have − / + for their quantity on the card.
Sorcery Points sit under the spell slots; **Convert** opens Flexible Casting (slot → points, points → slot).
Created slots show as `+1` next to the level and vanish on a Long Rest.

## Rules data and license

Rules text comes from the **System Reference Document 5.2.1** (Wizards of the Coast, CC-BY-4.0),
via the Markdown transcription https://github.com/downfallx/dnd-5e-srd-markdown (CC-BY-4.0).
To regenerate: clone that repo and run `node scripts/build-srd-data.mjs <path>`.
The tests check the parsed class tables against the official multiclass spell-slot table.

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC,
available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0
International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Compatible with fifth edition. Not affiliated with or endorsed by Wizards of the Coast.

# Hero Deck: writing a character file

**A guide for AI assistants.** A player has given you this document because they want their Dungeons & Dragons
character in **Hero Deck**, a free character tracker that runs in the browser
(<https://itram05.github.io/DnD-Character-Manager/>). The app stores each hero as one JSON object and can import such a
file. Your job is to interview the player, then write that file so that it imports with no adjustments and nothing lost.

You have not seen the app and you cannot see its code. Everything you need is in this document: how the app behaves,
the complete file format, the mistakes that go wrong quietly, and a full working example at the end.

This guide describes **schema version 3**, the format of the published app.

## 1. Ground rules

- **Speak the player's language.** This guide is in English because the game's terms and the app's interface are
  English. Talk to the player in whatever language they write to you. Keep game terms and everything inside the file
  in English (spell names, conditions, "Bonus Action"): the app reads some of those words.
- **Assume the 2024 rules** (D&D 5e, 2024 Player's Handbook / SRD 5.2). Use the 2014 rules only if the player says so.
  See [section 4](#4-edition-2024-unless-the-player-says-otherwise).
- **Ask in small rounds**, not one long questionnaire. [Section 2](#2-how-to-run-the-conversation) gives the order.
- **Never invent rules content the player did not confirm.** Where they do not know something, pick a sensible value,
  and list every such guess at the end.
- **The output is one JSON file**, strict JSON, nothing else in it. [Section 9](#9-output-and-import).

## 2. How to run the conversation

### Start from what the player already has

First ask whether they have the character written down anywhere: a PDF or photo of the sheet, a D&D Beyond page, notes,
or a file exported from Hero Deck. If they do, read it, extract everything you can, show a short summary of what you
understood, and then ask **only** for what is missing or unclear. A player who uploads a full sheet should get three or
four questions, not thirty.

If they have nothing, build the hero with them in the rounds below.

### The rounds

Move on when a round is settled. Offer your best guess wherever you can work one out ("a level 5 Ranger has 6 prepared
spells; which ones?") instead of asking open questions.

1. **Identity.** Hero's name, player's name, species (and lineage or ancestry if the species has one), background,
   alignment. Mention once that you assume the 2024 rules.
2. **Class and level.** Class, subclass, level. For a multiclass hero: every class with its level, and which class was
   taken **first** (that one decides the saving throws). XP total, or "we level by milestones". How many players share XP.
3. **Numbers.** The six ability scores as they stand now (after background, feats and level-ups), Hit Point maximum,
   Speed. Skill proficiencies and Expertise, tools, languages.
4. **Features.** Work these out yourself from class, subclass, level, species, background and feats, show the list by
   name, and ask only for the choices: Fighting Style, Weapon Masteries, Metamagic, Invocations, feats, a Hunter's Prey
   option, and anything homebrew.
5. **Spells** (casters only). Cantrips, prepared spells, spells that are always prepared (subclass, species, feats), and
   spells with free casts.
6. **Equipment.** Armor and shield, weapons, magic items (attuned or not, charges, exact text), potions and scrolls,
   other gear worth listing, coins.
7. **Where things stand right now.** Current Hit Points, spell slots already spent, features and item charges already
   used, Hit Point Dice spent, conditions, Exhaustion, Heroic Inspiration. If the player does not care, start the hero
   fresh after a Long Rest: full Hit Points, nothing spent.
8. **Story** (optional, offer to skip). Appearance, personality, ideals, bonds, flaws, goals, backstory.

### When the player does not know

Do not stall. Choose the most ordinary value, mark it, and keep going:

- A missing number you can calculate (Hit Points from class and Constitution, using the fixed value per level): calculate it.
- A missing choice (which Fighting Style): ask once; if they still do not know, take the option the 2024 rules
  recommend and say so.
- A missing text (what a homebrew item does exactly): ask for a photo or a paste. If there is none, write what the
  player remembers and mark the item's description with "(from memory, check with the DM)".

### Check your work against the sheet

The app calculates most numbers ([section 5](#5-what-the-app-calculates-and-what-you-must-write)). That gives you a
free test. Before you write the file, calculate what the app will show (Armor Class, Initiative, attack bonuses, spell
save DC, spell slots) from the data you collected, and compare with the player's sheet. If the sheet says AC 18 and
your data gives 17, something is missing (a shield, a Fighting Style, a magic item). Find it and fix the **data**.

### Closing the conversation

Give the player, in this order:

1. The file.
2. **"What I assumed"**: every value you guessed or defaulted.
3. **"What you should see"**: the numbers the app will calculate (AC, Initiative, spell save DC, spell slots per
   level, attack bonuses). If the app shows something else, they tell you and you fix the file.
4. How to import it ([section 9](#9-output-and-import)).

## 3. What the app is

Knowing how the app uses the data lets you make good choices where this guide has no rule.

Hero Deck is a tracker for the table, not a rules engine or a character builder. It has tabs: **Play**, **Stats**,
**Spells**, **Gear**, **Features**, **Story**, **Level Up**, **Edit**, **Rules**.

**Play** is the heart of it. Everything the hero can *do* is a **card**, sorted into four **hands** by what it costs:
Action, Bonus Action, Reaction, and Free / Other. A card with limited uses shows them; using the last one "taps" the
card. Short Rest and Long Rest buttons untap what they restore. Spell slots sit in their own panel, as do
Concentration, healing potions and Sorcery Points. Passive features are small chips on an **Always on** strip.

What becomes a card:

| In the file | On the Play screen |
|---|---|
| A feature with `activation` other than `passive` | A card in the hand of its activation |
| A feature with `activation: "passive"` | A chip on the Always on strip |
| An attack | A card in the Action hand, with the attack bonus and damage calculated |
| A cantrip, or a spell with `prepared` or `alwaysPrepared` | A card in the hand of its casting time |
| An item with `powers` | One card per active power; passive powers are chips |
| An item with `charges` or `activation` (and no active powers) | One card for the item |
| A spell scroll or a potion (recognized by name) | A card in the "Scrolls & Potions" group; healing potions are counters |
| Any other item | Nothing on Play; it is listed on the Gear tab |

So the choices that matter most are `activation` (which hand) and the counters (`uses`, `charges`, `freeCasts`).
A wrong ability score is easy to see and fix in the app. A reaction filed as an action is a card the player will not
find when they need it.

The app reads **descriptions** to help the player: it highlights dice, damage types, saving throws and conditions,
puts small icons on cards (range, area, damage, save) and adds filter tags (damage, healing, control). None of this is
stored. It works best when the text uses the game's own wording: "8d6 Fire damage", "Dexterity saving throw",
"20-foot-radius Sphere", "regains 2d8 Hit Points", "within 30 feet".

## 4. Edition: 2024 unless the player says otherwise

The app is built on the 2024 rules. Its class tables, spell slots, multiclass rule and Exhaustion are the 2024 ones,
and a file needs nothing special to use them. Tell the player once that you assume 2024, and move on.

If the player says their table plays the **2014 rules**, the same file format works, with these differences:

| What | What to do in the file |
|---|---|
| Exhaustion | Add `"exhaustionRules": "2014"` at the top level. The app then applies the 2014 table (Disadvantage on checks, halved Speed, and so on) instead of −2 per level. This is the only edition switch the app has. |
| Spell slots | The app calculates slots by the 2024 rules. They differ from 2014 in two cases: a Paladin or Ranger of level 1 (2014: no slots), and a multiclass hero with Paladin or Ranger levels (2014 rounds half of those levels **down**, the app rounds **up**). In those cases work out the slots by the 2014 rules and write them in `spellcasting.slotsOverride`, for example `[4, 2]`, or `[0]` for no slots. The override is a fixed list: tell the player it must be changed by hand when the hero levels up. In every other case leave it out. |
| Counters of class features | Write the maximum as a plain number, or a formula with `pb`, `level` and ability modifiers. Do not use class-table formulas such as `"cleric.channel-divinity"`: those tables hold the 2024 numbers. |
| Feature and spell texts | Write the 2014 text. The app has no 2014 content, but it does not need any: descriptions are the player's own text. |
| Weapon Mastery | Does not exist in 2014: leave `weaponMasteries` empty and `mastery` blank. |
| Race | Goes in `species` (the app's word). Inspiration is `heroicInspiration`. |
| Jack of All Trades | The app adds half the Proficiency Bonus to skills only. In 2014 it also applies to Initiative: add it to `combat.initiativeBonus`. |

Tell a 2014 player what the app will still do the 2024 way, because no field changes it: a Long Rest gives back **all**
Hit Point Dice (2014: half), the Level Up tab suggests 2024 features, and the limits shown on the Spells tab are the
2024 ones. None of that damages the file; they correct by hand.

## 5. What the app calculates, and what you must write

The app derives a lot. Writing a derived number into the file is not possible (there is no field for it), and adding a
field of your own for it only produces an "unknown field" notice. The second list is the one that needs care: those
things look as if the app would know them, and it does not.

**Calculated by the app. Do not look for a field.**

- Ability modifiers, from the scores.
- Proficiency Bonus, from the total level.
- Saving throws: modifier, plus Proficiency Bonus if proficient, plus `saveBonus` of active items.
- Skill bonuses and passive scores, from proficiency or Expertise (and Jack of All Trades).
- Initiative: Dexterity modifier + `combat.initiativeBonus`.
- Armor Class: the equipped armor's base + Dexterity (capped), or the `unarmoredAc` formula when no armor is worn; plus
  `acBonus` of active items, plus `combat.acBonus`.
- Attack bonus and damage modifier of every attack: ability modifier + Proficiency Bonus (if proficient) + `bonus`.
- Spell save DC and spell attack bonus, for each spellcasting class: 8 + modifier + Proficiency Bonus + item bonuses.
- Spell slots per level, from the class table; for several caster classes, by the 2024 multiclass rule. Pact Magic
  slots separately.
- The pool of Hit Point Dice, from the classes.
- The maximum of any counter written as a formula (`"pb"`, `"paladin * 5"`).
- The effects of Exhaustion on Speed and rolls.
- XP needed for the next level; total weight carried.

**Not calculated. You must write these.**

- **Hit Point maximum** (`combat.hp.max`). Include everything: Constitution, Tough, Draconic Resilience, a Dwarf's bonus.
- **Speed** (`combat.speed`), with every permanent bonus already in it.
- **Ability scores**: the final scores, with background, feats and level-ups applied. The app adds nothing to them.
- **Every feature, as text.** Importing a "Fighter 5" does not give the hero Second Wind or Extra Attack. The
  `features` list in the file is the whole truth: a feature you leave out does not exist in the app.
- **Every spell, as text.** A spell with only a name imports as a card with no text.
- **Attacks.** Each weapon or attack the player wants as a card is an entry in `attacks`. The app does not make one
  from a weapon in the inventory.
- **Bonuses that do not come from an item**: Fighting Style Defense (+1 AC) goes in `combat.acBonus`; Archery (+2) in
  the `bonus` of each ranged attack; the Alert feat (Proficiency Bonus to Initiative) in `combat.initiativeBonus` as a
  plain number. That number does not grow with the hero: tell the player to raise it when the Proficiency Bonus goes up
  (levels 5, 9, 13, 17).
- **Unarmored Defense** and its kin: write the formula in `combat.unarmoredAc` (Barbarian `"10 + dex + con"`,
  Monk `"10 + dex + wis"`, Draconic Sorcery `"10 + dex + cha"`).
- **A magic weapon's +1**: `bonus` and `damageBonus` of its attack.
- Resistances, senses, languages, tool proficiencies: text only (a feature, or the `proficiencies` text fields).

## 6. Content from outside the free rules

The app is public, so it ships only what may be shared freely: the **System Reference Document 5.2.1** (the 2024 SRD).
That is 12 classes with one subclass each, 9 species, 4 backgrounds, 17 feats and 339 spells. Anything else (other
subclasses, spells, species, feats and items from the Player's Handbook and other books, and all homebrew) is unknown
to the app.

That matters less than it sounds, because of how import works: **the importer does not fill in rules text for
anything, SRD or not.** You write every feature, spell and item into the file. Where the app's own data is actually
used is narrow:

| The app's data | What it is used for | If the content is not in the SRD |
|---|---|---|
| The 12 classes: `barbarian bard cleric druid fighter monk paladin ranger rogue sorcerer warlock wizard` | Hit die, saving throws, spell slots, the spellcasting ability, class-table formulas | Any other class (Artificer, a homebrew class): give `hitDie`, `casterType`, `spellcastingAbility` on the class entry and write `proficiencies.savingThrows`. Without `hitDie` the import reports an adjustment and assumes d8. |
| One subclass per class (Berserker, Lore, Life, Land, Champion, Open Hand, Devotion, Hunter, Thief, Draconic Sorcery, Fiend, Evoker) | Only the Level Up tab, later | `subclass` is free text; any name is fine. A subclass that grants spellcasting to a non-caster (Eldritch Knight, Arcane Trickster) needs `"casterType": "third"` and `"spellcastingAbility": "int"` on the class entry. |
| The spell list | The text of a **spell scroll**, when the hero does not have that spell | Put the spell's text in the scroll item's `description`. |
| Species, backgrounds, feats | The builder inside the app; not used on import | Nothing to do. |

So for content from a book the app does not ship, do exactly what you do for everything else: **write it out in the
hero's own data.** A subclass feature is an entry in `features` with its full text; a spell is an entry in `spells`
with all its fields; a magic item is an item with its `description` and `powers`.

Where the text comes from is between you and the player. The file is the player's own notes about their own
character. Ask them to paste or photograph the text from their book or their DM's handout, and use it. If you would
rather not reproduce a passage word for word, write it in your own words, keeping **every number, range, duration,
saving throw, condition and limit**. Never leave a description empty, and never write "see the Player's Handbook,
page 87": at the table the card is all the player has.

## 7. The file format

One JSON object. In the tables, the **Write** column says what a good file contains:

- **always**: write it, even though the importer would accept the file without it;
- **if it applies**: write it when the hero has that thing;
- **optional**: write it if you have the information;
- **leave out**: the app writes it itself.

Technically the importer requires nothing: `{}` imports as an empty level 1 hero, and every missing field takes the
default in the table. A default is a fallback, not a goal.

Write the **current** state of the hero. The file holds both what the hero is (scores, features) and where they
stand in the session (Hit Points, spent slots, used charges).

### Formulas

Wherever a type says *formula*, you can write a plain number, or a text the app evaluates each time:

| In a formula | Means |
|---|---|
| `str` `dex` `con` `int` `wis` `cha` | the ability **modifier** |
| `str_score` ... `cha_score` | the ability **score** |
| `pb` | Proficiency Bonus |
| `level` | total character level |
| a class id from the hero's `classes`: `paladin`, `wizard` | the hero's level in that class (an SRD class the hero does not have counts as 0) |
| `class.column`: `barbarian.rages`, `monk.focus-points` | the number in that column of the SRD (2024) class table at the hero's class level |
| `+ - * /`, `( )`, `min()`, `max()`, `floor()`, `ceil()` | arithmetic |

Columns available: Barbarian `rages`, `rage-damage`; Bard, Cleric, Druid, Sorcerer, Warlock, Wizard `cantrips`;
every caster class `prepared-spells`; Cleric and Paladin `channel-divinity`; Druid `wild-shape`; Fighter `second-wind`; Monk
`focus-points`, `unarmored-movement`; Ranger `favored-enemy`; Sorcerer `sorcery-points`; Warlock
`eldritch-invocations`; Barbarian and Fighter `weapon-mastery`.

A formula is better than a number when the value grows with the hero: `"pb"` is still right after the next level-up,
`3` is not. But **a name the app does not know counts as 0, with no warning**. A typo such as `"profbonus"` gives a
feature with no uses. Use only the names above.

The usual 2024 counters, as the app's own builder writes them:

| Feature | `uses` |
|---|---|
| Rage | `{ "max": "barbarian.rages", "used": 0, "recharge": "long", "shortRestRegain": 1 }` |
| Bardic Inspiration | `{ "max": "max(1, cha)", "used": 0, "recharge": "long" }` (`"short"` from Bard level 5) |
| Channel Divinity | `{ "max": "cleric.channel-divinity", "used": 0, "recharge": "long", "shortRestRegain": 1 }` (or `paladin.`) |
| Wild Shape | `{ "max": "druid.wild-shape", "used": 0, "recharge": "long", "shortRestRegain": 1 }` |
| Second Wind | `{ "max": "fighter.second-wind", "used": 0, "recharge": "long", "shortRestRegain": 1 }` |
| Action Surge | `{ "max": "min(2, 1 + floor(fighter / 17))", "used": 0, "recharge": "short" }` |
| Monk's Focus | `{ "max": "monk.focus-points", "used": 0, "recharge": "short" }` |
| Lay On Hands | `{ "max": "paladin * 5", "used": 0, "recharge": "long", "note": "HP pool" }` |
| Font of Magic | `{ "max": "sorcerer.sorcery-points", "used": 0, "recharge": "long", "note": "Sorcery Points", "resource": "sorcery-points" }` |
| Arcane Recovery | `{ "max": 1, "used": 0, "recharge": "long" }` |
| A species trait usable Proficiency Bonus times | `{ "max": "pb", "used": 0, "recharge": "long" }` |

### Text fields

Every `description` is plain text with a little formatting. Inside a JSON string a line break is `\n`.

- A blank line (`\n\n`) starts a new paragraph.
- `**bold**` and `_italic_` work. Italic is the convention for a sub-heading: `_Using a Higher-Level Spell Slot._`
- A block whose lines all start with `• ` or `- ` is a bullet list.
- A block whose lines all start with `|` is a table: `| Level | Damage |\n| 5 | 2d8 |`. The first line is the header.
  Do **not** add a Markdown separator line (`|---|---|`); it would show as a row of dashes.
- Nothing else: no `#` headings, no links, no HTML.
- **Lead with the rule.** A card's face shows only the first 140 characters or so, and an item's panel only the
  first paragraph; the full text is one tap away. Flavour and remarks go last.

### Ids

Features, attacks, spells, items, item powers, notes, timers and the hero itself each have an `id`. The importer makes
one up when it is missing, so a file without ids works. Write them anyway, as short readable texts that are unique in
the file (`"feat-second-wind"`, `"item-longbow"`), for two reasons: an attack points at its weapon by the item's id,
and when the player later re-imports an edited file, the hero's own `id` is how the app knows it is the same hero.
Give the hero an id nobody else will have, such as the name plus a few random characters: `"hero-vessa-thornhide-7k2q9d"`.

### Top level

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `schemaVersion` | number | always | 1 | Write `3`. Without it the file is read as the oldest format. A number above the app's own is refused. |
| `id` | text | always | generated | Identifies the hero in the browser. See [Ids](#ids). |
| `name` | text | always | "Unnamed hero" | |
| `player` | text | optional | "" | |
| `species` | `{ name, size }` | always | `{ "", "Medium" }` | `name`: free text ("Elf (Wood Elf)"). `size`: "Medium", "Small". A plain text is read as the name. (`race` is read as an alias; write `species`.) |
| `background` | text | always | "" | Free text. |
| `alignment` | text | optional | "" | Free text. |
| `xp` | number ≥ 0 | always | 0 | Total experience points. See the table below. |
| `partySize` | 1–20 | optional | 5 | How many players share the XP the DM gives the group. |
| `xpLog` | list | leave out | [] | History written by the app's XP panel. See [xpLog](#xplog). |
| `classes` | list | always | Fighter 1 | See [classes](#classes). |
| `abilities` | object | always | all 10 | See [abilities](#abilities). |
| `proficiencies` | object | always | | See [proficiencies](#proficiencies). |
| `combat` | object | always | | See [combat](#combat). |
| `conditions` | list of text | if it applies | [] | Conditions on the hero now, lowercase: `blinded` `charmed` `deafened` `frightened` `grappled` `incapacitated` `invisible` `paralyzed` `petrified` `poisoned` `prone` `restrained` `stunned` `unconscious`. Not Exhaustion: that is the next field. |
| `exhaustion` | 0–6 | if it applies | 0 | Exhaustion level. Its effects are applied automatically. |
| `exhaustionRules` | `"2014"` | 2014 only | absent = 2024 | See [section 4](#4-edition-2024-unless-the-player-says-otherwise). Leave it out for a 2024 hero. |
| `heroicInspiration` | true/false | optional | false | |
| `features` | list | always | [] | See [features](#features). |
| `attacks` | list | always | [] | See [attacks](#attacks). |
| `spellcasting` | object | casters | all 0 | Slots spent and Concentration. See [spellcasting](#spellcasting). |
| `spells` | list | casters | [] | See [spells](#spells). |
| `inventory` | `{ items, money }` | always | empty | See [items](#items) and [money](#money). |
| `roleplay` | object | optional | all "" | See [roleplay](#roleplay). |
| `sessionNotes` | list | optional | [] | See [sessionNotes](#sessionnotes). |
| `timers` | list | optional | [] | See [timers](#timers). |
| `updatedAt` | ISO date-time text | optional | now | When the hero was last changed, e.g. `"2026-10-03T12:00:00.000Z"`. The hero list is sorted by it. |

**XP.** The app compares `xp` with the hero's total level and offers a level-up when the XP reaches the next
threshold. If the table levels by milestones, or the player does not know the XP, write the threshold of the
**current** level, so the app neither nags about a level-up nor reports the XP as too low.

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| XP | 0 | 300 | 900 | 2700 | 6500 | 14000 | 23000 | 34000 | 48000 | 64000 |

| Level | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|
| XP | 85000 | 100000 | 120000 | 140000 | 165000 | 195000 | 225000 | 265000 | 305000 | 355000 |

### classes

A list, one entry per class. **The first entry is the class the hero started in**: it decides the saving throw
proficiencies when `proficiencies.savingThrows` is empty.

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `id` | text | always | | For the 12 SRD classes, the lowercase English name (`"ranger"`). It connects the hero to the class table. For any other class, a lowercase id of your own (`"artificer"`). |
| `name` | text | always | the SRD name | Shown on the sheet ("Ranger"). |
| `level` | 1–20 | always | 1 | Level in this class. The levels of all classes must not add up to more than 20. |
| `subclass` | text | if it applies | absent | Free text. |
| `hitDie` | number | non-SRD classes only | from the SRD; else 8 | `8` for a d8. Needed for a class that is not in the SRD. |
| `casterType` | `full` `half` `third` `pact` `none` | see note | from the SRD | How the class counts toward spell slots. |
| `spellcastingAbility` | `str` `dex` `con` `int` `wis` `cha` | with `casterType` | from the SRD | |

Write `casterType` and `spellcastingAbility` in exactly two cases: a class that is not in the SRD, and a non-caster
class whose subclass casts spells (Eldritch Knight, Arcane Trickster: `"third"`, `"int"`). On an ordinary SRD caster
leave both out: with `casterType` set, the app stops using the class's own slot table and falls back to a generic one.

### abilities

`{ "str": 10, "dex": 18, "con": 14, "int": 12, "wis": 15, "cha": 8 }`

All six of `str` `dex` `con` `int` `wis` `cha`, always. Scores from 1 to 30, final values. Default 10 each.

### proficiencies

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `savingThrows` | list of ability ids | always | the first class's | `["str", "dex"]`. Include a save gained from a feat (Resilient). |
| `skills` | object | always | none | Only the skills the hero is trained in: `{ "stealth": "expertise", "perception": "proficient" }`. |
| `jackOfAllTrades` | true/false | Bards level 2+ | false | Adds half the Proficiency Bonus to untrained skills. |
| `armor` | text | optional | "" | Shown as written: "Light and Medium armor, Shields". |
| `weapons` | text | optional | "" | "Simple and Martial weapons". |
| `tools` | text | optional | "" | "Thieves' Tools". |
| `languages` | text | optional | "" | "Common, Elvish". |
| `weaponMasteries` | list of text | if it applies | [] | `["Longbow (Slow)", "Shortsword (Vex)"]`. Shown as written. |

Skill ids, exactly as spelled here: `acrobatics` `animalHandling` `arcana` `athletics` `deception` `history`
`insight` `intimidation` `investigation` `medicine` `nature` `perception` `performance` `persuasion` `religion`
`sleightOfHand` `stealth` `survival`. Values: `"proficient"` or `"expertise"` (leave untrained skills out).

### combat

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `hp` | `{ max, current, temp }` | always | 10 / max / 0 | `max`: the Hit Point maximum (not calculated). `current`: Hit Points now, from 0 to `max`. `temp`: Temporary Hit Points. |
| `speed` | number | always | 30 | Walking Speed in feet. Exhaustion is subtracted by the app. |
| `unarmoredAc` | formula | always | `"10 + dex"` | Armor Class when no body armor is equipped. |
| `acBonus` | number | always | 0 | Armor Class bonus that does not come from an item in the inventory (Fighting Style Defense). |
| `initiativeBonus` | number | always | 0 | Added to the Dexterity modifier for Initiative (Alert: the Proficiency Bonus as a number). |
| `hitDiceUsed` | object | if it applies | {} | Hit Point Dice spent, by die: `{ "d10": 1 }`. The pool itself is calculated. |
| `deathSaves` | `{ successes, failures }` | optional | 0 / 0 | Each 0–3. |

### features

A list. Class features, subclass features, species traits, background features, feats, boons, and anything else that
is a rule about this hero.

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `id` | text | always | generated | |
| `name` | text | always | "Unnamed feature" | The card's title. |
| `source` | `{ type, name }` | always | `other`, "" | `type`: one of `class` `subclass` `species` `background` `feat` `item` `other`; it colours the card's frame. `name`: free text shown on the card, by convention where it comes from: "Ranger 2", "Hunter 3", "Orc". |
| `activation` | see below | always | `passive` | Which hand the card is in. |
| `uses` | [counter](#counters) | if it applies | absent | Limited uses. |
| `description` | text | always | "" | The rule. See [Text fields](#text-fields). |
| `level` | 1–20 | optional | absent | The level at which it was gained. Informational. |
| `tags` | list of text | optional | absent | See [Tags](#tags). |

`activation` is one of:

| Value | Use it for | Where it shows |
|---|---|---|
| `passive` | Always on, nothing to do: Darkvision, Extra Attack, a Fighting Style | A chip on the Always on strip |
| `action` | Takes an action, including a Magic action | Action hand |
| `bonus` | Takes a Bonus Action | Bonus Action hand |
| `reaction` | Takes a Reaction | Reaction hand |
| `free` | No action, but the player decides to use it: Reckless Attack, Action Surge, Sneak Attack, Metamagic | Free / Other hand |
| `special` | Something else: a trigger, part of a rest, a pool | Free / Other hand |

How finely to split features is a judgment call. A good rule: **one card per decision the player makes at the
table.** Channel Divinity with two options works better as the Channel Divinity card (with the counter) plus one card
per option (no counter) than as one long text. Features that only record a choice already expressed in numbers
(Ability Score Improvement, "Spellcasting", "Ranger Subclass") can be left out.

A feature granted by a magic item: set `source` to `{ "type": "item", "name": "<the item's exact name>" }`. It then
appears and disappears together with that item (see [the Play rule](#the-play-rule-equipped-and-attuned)). For
abilities of an item, prefer `powers` on the item itself.

### Counters

One shape is used for a feature's `uses`, an item's `charges`, an item power's `uses`, and a spell's `freeCasts`.

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `max` | formula | always | 1 | How many there are. |
| `used` | number ≥ 0 | always | 0 | How many are spent **now** (not how many are left). |
| `recharge` | see below | always | `long` | When the Rest buttons give them back. |
| `shortRestRegain` | formula | if it applies | absent | With `recharge: "long"`: how many come back on a Short Rest (Rage, Channel Divinity, Wild Shape, Second Wind: `1`). |
| `regain` | text | if it applies | absent | A roll, such as `"1d6+1"`. **With this set, rests do not refill the counter**; they remind the player to roll. For "regains 1d6+1 charges at dawn". Leave it out when everything simply comes back. |
| `note` | text | optional | absent | A label next to the counter: "HP pool". |
| `resource` | `"sorcery-points"` | Sorcerers | absent | Marks the Sorcery Points counter, so the app shows it beside the spell slots with the Flexible Casting buttons. It is the only value. |

`recharge` is one of:

| Value | Meaning |
|---|---|
| `short` | Comes back on a Short Rest **or** a Long Rest. |
| `long` | Comes back on a Long Rest. |
| `dawn` | Comes back at dawn (magic items). A Long Rest counts as a dawn passing unless the player unticks that. |
| `other` | Never automatic; the player resets it by hand ("once every 7 days"). |
| `none` | Never comes back (a single-use boon). |

### attacks

A list. Each entry is a card in the Action hand.

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `id` | text | always | generated | |
| `name` | text | always | "Attack" | |
| `ability` | `str` `dex` `con` `int` `wis` `cha` `finesse` `spell` | always | `str` | The modifier used. `finesse` = the better of Strength and Dexterity. `spell` = the spellcasting ability of the first caster class. |
| `proficient` | true/false | always | true | Adds the Proficiency Bonus to the attack roll. |
| `bonus` | number | always | 0 | Extra to hit: a +1 weapon, Archery's +2. |
| `damage` | text | always | "" | **Dice only**: `"1d8"`. The app appends the modifier itself. |
| `damageType` | text | always | "" | "Piercing", "Fire". |
| `addAbilityToDamage` | true/false | always | true | False for an off-hand attack without the Two-Weapon Fighting style, and for most spell attacks. |
| `damageBonus` | number | always | 0 | Extra damage: a +1 weapon, Dueling's +2. |
| `mastery` | text | optional | "" | The weapon's mastery property, if the hero can use it: "Vex". |
| `notes` | text | optional | "" | Range, properties, riders: "Range 150/600 ft." |
| `itemId` | text or null | always | linked by name | The `id` of the item this attack is made with, or `null` for none (Unarmed Strike, a cantrip). |

Always write `itemId`. When it is missing, the importer links the attack to an item whose name the attack's name
starts with, and reports that as an adjustment. A linked attack follows its item: it is hidden from Play while the
item is not equipped.

A cantrip that needs an attack roll (Fire Bolt, Eldritch Blast) is a spell. If the player uses it every turn, you may
**also** add it to `attacks` with `"ability": "spell"`, `"addAbilityToDamage": false` and `"itemId": null`, so that a
card shows the attack bonus.

### spellcasting

The state of the hero's magic, not their spells.

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `slotsUsed` | list of 9 numbers | casters | all 0 | Slots **spent** per spell level; the first number is level 1. `[1, 1, 0, 0, 0, 0, 0, 0, 0]`. |
| `pactSlotsUsed` | number | Warlocks | 0 | Pact Magic slots spent. |
| `concentration` | text | if it applies | "" | The name of the spell the hero is concentrating on now. |
| `slotsOverride` | list of numbers | rarely | absent | Replaces the calculated slots: `[4, 3, 2]`. For homebrew, and for the 2014 cases in [section 4](#4-edition-2024-unless-the-player-says-otherwise). Otherwise leave it out, so that the slots keep following the level. |
| `pactOverride` | `{ slots, level }` | rarely | absent | The same for Pact Magic: how many `slots`, of which spell `level`. |
| `bonusSlots` | list of 9 numbers | leave out | absent | Slots a Sorcerer created from Sorcery Points; the app writes and clears it. |

### spells

A list. Every spell the hero can cast, or has in a spellbook.

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `id` | text | always | generated | |
| `name` | text | always | "Unnamed spell" | |
| `level` | 0–9 | always | 0 | 0 = cantrip. |
| `source` | text | always | absent | Which class the spell belongs to: that class's `id`, exactly (`"ranger"`). The Spells tab counts prepared spells per class by it. For a spell from elsewhere: `"feat"`, `"species"`, `"item"`. |
| `prepared` | true/false | always | true | A prepared spell is a card on Play. `false`: only on the Spells tab (a Wizard's spellbook). Cantrips are always cards. |
| `alwaysPrepared` | true/false | always | false | Granted by a subclass, species or feat: always a card, and not counted against the class's limit. |
| `ritual` | true/false | always | false | |
| `concentration` | true/false | always | false | Casting it puts it in the Concentration slot. |
| `school` | text | always | "" | "Evocation". |
| `castingTime` | text | always | "" | **Starts with** `Action`, `Bonus Action` or `Reaction`; this decides the hand. Anything else ("1 minute", "10 minutes") goes to Free / Other; left empty, it counts as Action. Extra words may follow: "Reaction, which you take when you are hit". |
| `range` | text | always | "" | "60 feet", "Self", "Touch". |
| `components` | text | always | "" | "V, S, M (a pinch of dirt)". |
| `duration` | text | always | "" | "Instantaneous", "1 hour", "up to 1 minute". Concentration is the flag above, not this text. |
| `description` | text | always | "" | The full effect, including what a higher-level slot does. |
| `freeCasts` | [counter](#counters) | if it applies | absent | Casts that need no slot: Magic Initiate, a species spell, Favored Enemy's Hunter's Mark, Mystic Arcanum. |
| `tags` | list of text | optional | absent | See [Tags](#tags). |

### items

`inventory.items` is a list of everything the hero carries.

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `id` | text | always | generated | |
| `name` | text | always | "Item" | Some words in a name have meaning; see [Names the app reads](#names-the-app-reads). |
| `quantity` | number ≥ 0 | always | 1 | |
| `equipped` | true/false | always | false | Worn, wielded or held ready. Decides Armor Class and what is on Play. |
| `requiresAttunement` | true/false | always | false | |
| `attuned` | true/false | always | false | At most 3 items. |
| `description` | text | always | "" | What it is and does. |
| `weight` | number | optional | absent | Pounds **per piece**. |
| `armor` | `{ base, dexCap }` | body armor | absent | `base`: the armor's AC. `dexCap`: the most Dexterity it allows: `null` = no limit (light armor), `2` (medium), `0` (heavy). |
| `acBonus` | number | if it applies | absent | Added to AC while the item is active. A Shield is an item with `"acBonus": 2` (no `armor`). |
| `saveBonus` | number | if it applies | absent | Added to every saving throw while active (Cloak of Protection: 1). |
| `spellDcBonus` | number | if it applies | absent | Added to the spell save DC while active. |
| `spellAttackBonus` | number | if it applies | absent | Added to spell attack rolls while active. |
| `charges` | [counter](#counters) | if it applies | absent | The item's pool of charges. |
| `activation` | as for features | if it applies | absent | Makes the item itself a card. Read the warning below before using it. |
| `powers` | list | if it applies | absent | The item's separate abilities. See [item powers](#item-powers). |
| `tags` | list of text | optional | absent | See [Tags](#tags). They also apply to every power of the item. |

"Active" means: equipped, and attuned if the item requires attunement.

Which shape to give an item:

| The item | Write |
|---|---|
| Mundane gear (rope, rations, tools) | `name`, `quantity`, maybe `weight` and `description`. Nothing else. |
| Body armor | `armor`, `equipped: true` |
| Shield | `acBonus: 2`, `equipped: true` |
| A weapon | A plain item with `equipped: true`, **and** an entry in `attacks` whose `itemId` is this item's `id` |
| A magic item that only gives bonuses | The bonus fields, `equipped`, and the attunement fields |
| A magic item with abilities | `powers` (and `charges` if they share a pool) |
| A consumable thrown or used up (Alchemist's Fire, Holy Water, caltrops) | `activation`, `quantity`, **no** `charges`. The card has − and + for the quantity. |
| A potion or a scroll | Just the right name and a `quantity`. See [Names the app reads](#names-the-app-reads). |

**The warning about `activation`.** An item with `activation`, without `charges` and without active powers is
treated as a consumable: using its card lowers `quantity`. That is right for a flask of Alchemist's Fire and wrong for
Boots of Speed. A reusable ability of an item always goes in `powers`, even when it is the item's only one.

### item powers

`powers` is a list on an item. Each active power is its own card, in the hand of its activation, labelled with the
item's name. A passive power is a chip on the Always on strip. An item with at least one active power has no card of
its own.

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `id` | text | always | generated | |
| `name` | text | always | "Unnamed power" | |
| `activation` | as for features | always | `action` | Note the default is not `passive` here. |
| `cost` | number or `"all"` | if it applies | absent = free | Charges taken from the item's `charges` per use. `"all"` = every charge left (at least 1). |
| `uses` | [counter](#counters) | if it applies | absent | The power's own counter, separate from the item's charges ("once per Long Rest"). |
| `description` | text | always | "" | |
| `tags` | list of text | optional | absent | |

A power can have a `cost`, its own `uses`, both, or neither. A power with `cost` needs `charges` on the item.

A bonus to the spell save DC or to spell attacks is **not** a power: use the item's `spellDcBonus` and
`spellAttackBonus`. (A passive power named like "+1 spell save DC" is converted by the importer, with an adjustment.)

### money

`inventory.money`: `{ "cp": 0, "sp": 14, "ep": 0, "gp": 43, "pp": 0 }`. Write all five of `cp` `sp` `ep` `gp` `pp`;
each is a number ≥ 0, default 0.

### roleplay

All text, all optional, default "": `appearance`, `personality`, `ideals`, `bonds`, `flaws`, `voice`, `mannerisms`,
`goals`, `backstory`, `allies`, `notes`. Write all eleven keys, with `""` for the ones the player skipped. `notes` is
the right home for anything about the hero that fits no other field.

### sessionNotes

A list of `{ id, date, title, text }`: the player's journal. `date` is text, by convention `"2026-09-27"`. Usually
empty in a new file.

### xpLog

Leave it as `[]`. The app's XP panel writes it: one entry per change of `xp`, each `{ id, date, kind, amount }` plus,
for a session, `groupXp` and `players`. `kind` is `"session"` or `"correction"`; `amount` is what was added to `xp`.
When you edit an exported file, keep the entries as they are.

### timers

Countdowns in days, for things the story is waiting on: `{ "id": "timer-rent", "name": "Rent due", "days": 9,
"start": 14, "note": "5 GP" }`. `days` is how many are left (0 = ended), `start` is what the timer was set to
(default: `days`), `note` is optional. A Long Rest takes one day off each. Usually empty in a new file.

### Tags

`tags` on spells, features, items and item powers are short lowercase labels the Play screen filters by.

The app adds some by itself, from the text, every time it shows a card: `damage` and the damage type, `healing`,
`control`, `concentration`, `ritual`, and `utility` for a card with no other category. Do not write those.

Write a tag when it adds something the text cannot say:

- the four categories the app never detects: `buff`, `defense`, `mobility`, `summon`;
- `control`, `damage` or `healing` on a card whose text does not use the words the app looks for;
- the player's own labels: `"bow"`, `"social"`, `"emergency"`.

Automatic tags cannot be removed. They are a reading aid and sometimes over-eager (a spell that mentions "Immunity to
Thunder damage" is tagged as damage). That is harmless; do not bend the rules text to avoid it.

## 8. Traps

Each of these produces a file that imports, and a hero that is quietly wrong.

### The Play rule: equipped and attuned

An item is on the Play screen (its card, its powers, its chips, the attacks linked to it, the features whose `source`
names it), and its bonuses count, only when it is **equipped, and attuned if it requires attunement**.

- A weapon left with `equipped: false` hides its attack card. Equip every weapon the hero fights with.
- A magic item with `requiresAttunement: true` and `attuned: false` does nothing, even when equipped.
- `attuned: true` only makes sense with `requiresAttunement: true` and `equipped: true`. Write all three.
- Consumables are the exception: potions, scrolls and quantity-spent items are on Play without being equipped.

The Gear tab lets the player equip and attune with one tap, so a hidden item is not lost. But they will think the
import failed.

### Three attuned items

If more than three items have `attuned: true`, the importer keeps the first three in list order and un-attunes the
rest, with an adjustment. Count them. If the hero has more (an Artificer), ask the player which three matter most and
describe the rest in `roleplay.notes`.

### Names the app reads

Potions and scrolls have no special fields. The app recognizes them **by the item's name**, when the item has no
`charges`:

| The name contains | The item becomes |
|---|---|
| "scroll" (but not "scroll case", "scroll tube", "scroll holder") | A spell scroll: a card that looks like the spell it holds |
| "potion", "elixir" or "philter" | A potion: a card with a Use button |
| one of those **and** "healing" | A healing potion: a counter beside Concentration, not a card. "Greater", "Superior" or "Supreme" in the name picks the kind. |

For a scroll, the spell is taken from the name. These forms work: `Scroll of Fireball`, `Spell Scroll of Fireball`,
`Spell Scroll (Fireball)`, `Scroll: Fireball`, `Fireball Scroll`. The text shown comes from the hero's own spell of
that name, else from the app's SRD spell list, else from the item's `description`. For a spell outside the SRD that
the hero does not otherwise have, put the full spell text in the scroll's `description`.

Name healing potions the standard way (`Potion of Healing`, `Potion of Greater Healing`). Their dice come from the
description, or else from the standard values.

The other side of this: a thing that merely has such a word in its name is taken for a potion or scroll. A "Potion
Belt" or an "Elixir Flask of Holding" should be named differently, or given `charges`.

### One counter per resource

A resource is counted in exactly one place. Favored Enemy lets a Ranger cast Hunter's Mark without a slot: that is
`freeCasts` on the Hunter's Mark spell, and the Favored Enemy feature is passive with **no** `uses`. If both had a
counter, the player would have two cards disagreeing about the same thing. The same goes for Magic Initiate, species
spells, and an item whose single power spends the item's charges (use `cost`, not a second counter).

### The casting time decides the hand

`castingTime` must **start** with `Action`, `Bonus Action` or `Reaction`. The 2014 style "1 action" and "1 bonus
action" does not match, and such a spell lands in the Free / Other hand. Write "Action", whatever the book says.

### Words with fixed spellings

The importer accepts a few variants ("Bonus Action" for `bonus`, "Strength" for `str`), but anything it does not
recognize falls back to a default and is reported. Use the exact values:

- abilities: `str` `dex` `con` `int` `wis` `cha`
- skills: camelCase, `sleightOfHand`, `animalHandling`
- class ids: lowercase, `ranger`; a spell's `source` must match it exactly
- conditions: lowercase
- `activation`, `recharge`, `source.type`: the lists in section 7

### Fields the app does not know

A field the app does not use is kept in the file untouched, and listed in the import dialog as "not a field this app
uses". Nothing breaks, but the player sees a list of adjustments and the information is not shown anywhere in the
app. So do not invent fields (`"rarity"`, `"resistances"`, `"notes"` on an item, `"hp"` at the top level). Put the
information where the app shows it: in a `description`, in a feature, or in `roleplay.notes`. A misspelled field
(`"descripton"`) is the same thing: the real field stays empty.

This also means: write only the fields in section 7. If you know the app from a later version with more features
(images, containers, crafting), do not use their fields here.

### Numbers out of range

Out-of-range numbers are clamped, with an adjustment: ability scores 1–30, class level 1–20, spell level 0–9,
Exhaustion 0–6, death saves 0–3, `hp.current` between 0 and `hp.max`. `used` is not checked against `max` on import;
keep it at or below.

### Strict JSON

The file is parsed as strict JSON, and a syntax error rejects the whole file.

- No comments, no trailing commas.
- Double quotes only, straight ones (`"`), never typographic quotes.
- Inside a text: `\"` for a quote, `\n` for a line break, `\\` for a backslash. No raw line breaks inside a string.
- `true`, `false` and `null` in lowercase, unquoted. Numbers unquoted.
- One object at the top, not a list. One hero per file.

## 9. Output and import

**The file.** One JSON object, encoded as UTF-8. Name it after the hero, in lowercase Latin letters and digits with
dashes, ending in `.json`: `vessa-thornhide.json`. That is how the app names its own exports. (The app accepts any
name ending in `.json`.) If you can attach or create a file, do. If you can only write text, put the whole JSON in one
code block and tell the player to save it as a plain-text file with that name.

Nothing but the JSON goes in the file. Your notes to the player go in the chat.

**Importing**, in words you can pass on:

1. Open <https://itram05.github.io/DnD-Character-Manager/>.
2. On the first screen (the list of heroes), press **Import JSON** and choose the file.
3. A dialog shows the hero's name, class and level. Below that is either "The file is clean. No adjustments needed."
   or a list of adjustments. Press **Import**.
4. If a hero with the same `id` is already there, the buttons are **Replace existing** and **Import as a copy**.

The goal is a clean import. If the dialog lists adjustments, ask the player to copy them to you: each one names the
field and says what was changed, which is enough to fix the file.

If the import is refused outright, the message says why: the text is not valid JSON, or `schemaVersion` is higher
than the app knows.

Tell the player that heroes live in **that browser on that device** only. To move a hero or keep a backup they use
**Export JSON**, next to the hero in the list.

## 10. Changing a hero later

When the player comes back to add an item, fix a feature or level up through you:

1. They press **Export JSON** in the app and give you that file, together with this guide. Work from the fresh
   export, never from the file you wrote earlier: since then the app has changed Hit Points, slots, charges and notes.
2. Change only what was asked. Keep everything else exactly as it is: every `id` (above all the hero's own), every
   counter's `used`, the `xpLog`, and any field you do not recognize. A field that is not in this guide was most
   likely written by a newer version of the app; removing it loses the player's data.
3. If the export's `schemaVersion` is higher than 3, this guide is out of date. Say so and ask for the current guide
   instead of guessing. Never lower the number.
4. On a level-up, go through what the app does not calculate (section 5): Hit Point maximum, new features, new
   spells, a higher `initiativeBonus` if it depends on the Proficiency Bonus, a `slotsOverride` if there is one.
5. Return the whole file, not a fragment. The player imports it and chooses **Replace existing**.

For small changes, the app's own editor (the Edit, Gear, Spells and Features tabs) is quicker than a round trip
through a file. Say so when it applies.

## 11. A complete example

Vessa Thornhide, an Orc Ranger (Hunter) of level 5, 2024 rules, in the middle of an adventuring day. The file
imports with no adjustments, and it is written the way the app itself exports: every field present, in the app's
order. Use it as the template for your own files.

Things to notice:

- **Numbers the app works out** from this file: Armor Class 17 (Studded Leather 12 + Dexterity 4 + Cloak of
  Protection 1), Initiative +7 (Dexterity 4 + `initiativeBonus` 3 for Alert), spell save DC 13, spell slots 4 and 2,
  Emberwood Longbow +10 to hit for 1d8+5, Shortsword +7 for 1d6+4. None of them is in the file.
- **Favored Enemy** is passive with no counter; the three free casts are `freeCasts` on Hunter's Mark, with the
  formula `"ranger.favored-enemy"`.
- **Adrenaline Rush** uses `"pb"` and comes back on a Short Rest; **Relentless Endurance** is a trigger, so `special`.
- **Emberwood Longbow** is homebrew, so everything about it is written out. It has a pool of 3 charges that regain
  by a roll (`regain`), two powers that spend charges (`cost`), one power with its own counter (`uses`), and a passive
  power. Its +1 and the Archery +2 are in the attack's `bonus`. The attack points at it with `itemId`.
- **Cloak of Protection** gives its bonuses through `acBonus` and `saveBonus`, and counts because it is equipped and
  attuned. Two attuned items in all.
- **Potion of Healing** and **Spell Scroll (Fog Cloud)** are recognized by name. **Alchemist's Fire** is a
  quantity-spent consumable: `activation`, no `charges`.
- **Goodberry** has `prepared: false`: on the Spells tab, not on Play.
- The state is mid-session: 31 of 44 Hit Points, one slot of each level spent, one Hit Point Die spent, one charge
  gone, concentrating on Hunter's Mark.

The spell texts are from the SRD 5.2.1.

<!-- EXAMPLE:START (a copy of examples/ai-guide-example.json; tests/aiGuide.test.ts keeps the two identical) -->
```json
{
  "schemaVersion": 3,
  "id": "hero-vessa-thornhide-7k2q9d",
  "name": "Vessa Thornhide",
  "player": "Example",
  "species": {
    "name": "Orc",
    "size": "Medium"
  },
  "background": "Criminal",
  "alignment": "Chaotic Good",
  "xp": 7200,
  "partySize": 4,
  "xpLog": [],
  "classes": [
    {
      "id": "ranger",
      "name": "Ranger",
      "level": 5,
      "subclass": "Hunter"
    }
  ],
  "abilities": {
    "str": 10,
    "dex": 18,
    "con": 14,
    "int": 12,
    "wis": 15,
    "cha": 8
  },
  "proficiencies": {
    "savingThrows": [
      "str",
      "dex"
    ],
    "skills": {
      "stealth": "expertise",
      "sleightOfHand": "proficient",
      "perception": "proficient",
      "survival": "proficient",
      "athletics": "proficient"
    },
    "jackOfAllTrades": false,
    "armor": "Light and Medium armor, Shields",
    "weapons": "Simple and Martial weapons",
    "tools": "Thieves' Tools",
    "languages": "Common, Orc, Dwarvish, Goblin, Sylvan",
    "weaponMasteries": [
      "Longbow (Slow)",
      "Shortsword (Vex)"
    ]
  },
  "combat": {
    "unarmoredAc": "10 + dex",
    "acBonus": 0,
    "initiativeBonus": 3,
    "speed": 30,
    "hp": {
      "max": 44,
      "current": 31,
      "temp": 0
    },
    "hitDiceUsed": {
      "d10": 1
    },
    "deathSaves": {
      "successes": 0,
      "failures": 0
    }
  },
  "conditions": [],
  "exhaustion": 0,
  "heroicInspiration": true,
  "features": [
    {
      "id": "feat-favored-enemy",
      "name": "Favored Enemy",
      "source": {
        "type": "class",
        "name": "Ranger 1"
      },
      "activation": "passive",
      "description": "You always have the _Hunter's Mark_ spell prepared. You can cast it without expending a spell slot a number of times shown in the Favored Enemy column of the Ranger table (3 at Ranger level 5), and you regain all expended uses when you finish a Long Rest.\n\nThe free casts are counted on the Hunter's Mark spell itself."
    },
    {
      "id": "feat-weapon-mastery",
      "name": "Weapon Mastery",
      "source": {
        "type": "class",
        "name": "Ranger 1"
      },
      "activation": "passive",
      "description": "You can use the mastery properties of two kinds of weapons you are proficient with: Longbow (Slow) and Shortsword (Vex). Whenever you finish a Long Rest, you can change the kinds of weapons you chose."
    },
    {
      "id": "feat-deft-explorer",
      "name": "Deft Explorer",
      "source": {
        "type": "class",
        "name": "Ranger 2"
      },
      "activation": "passive",
      "description": "_Expertise._ You have Expertise in Stealth.\n\n_Languages._ You know two extra languages: Goblin and Sylvan."
    },
    {
      "id": "feat-fighting-style-archery",
      "name": "Fighting Style: Archery",
      "source": {
        "type": "feat",
        "name": "Ranger 2"
      },
      "activation": "passive",
      "description": "You gain a +2 bonus to attack rolls you make with Ranged weapons.\n\nAlready counted in the Emberwood Longbow attack's bonus."
    },
    {
      "id": "feat-hunter-s-lore",
      "name": "Hunter's Lore",
      "source": {
        "type": "subclass",
        "name": "Hunter 3"
      },
      "activation": "passive",
      "description": "While a creature is marked by your _Hunter's Mark_, you know whether that creature has any Immunities, Resistances, or Vulnerabilities, and if the creature has any, you know what they are."
    },
    {
      "id": "feat-hunter-s-prey-colossus-slayer",
      "name": "Hunter's Prey: Colossus Slayer",
      "source": {
        "type": "subclass",
        "name": "Hunter 3"
      },
      "activation": "free",
      "description": "When you hit a creature with a weapon, the weapon deals an extra 1d8 damage to the target if it's missing any of its Hit Points. You can deal this extra damage only once per turn.\n\nWhenever you finish a Short or Long Rest, you can replace this option with Horde Breaker."
    },
    {
      "id": "feat-extra-attack",
      "name": "Extra Attack",
      "source": {
        "type": "class",
        "name": "Ranger 5"
      },
      "activation": "passive",
      "description": "You can attack twice instead of once whenever you take the Attack action on your turn."
    },
    {
      "id": "feat-adrenaline-rush",
      "name": "Adrenaline Rush",
      "source": {
        "type": "species",
        "name": "Orc"
      },
      "activation": "bonus",
      "description": "You can take the Dash action as a Bonus Action. When you do so, you gain a number of Temporary Hit Points equal to your Proficiency Bonus.\n\nYou can use this trait a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Short or Long Rest.",
      "uses": {
        "max": "pb",
        "used": 1,
        "recharge": "short"
      }
    },
    {
      "id": "feat-relentless-endurance",
      "name": "Relentless Endurance",
      "source": {
        "type": "species",
        "name": "Orc"
      },
      "activation": "special",
      "description": "When you are reduced to 0 Hit Points but not killed outright, you can drop to 1 Hit Point instead. Once you use this trait, you can't do so again until you finish a Long Rest.",
      "uses": {
        "max": 1,
        "used": 0,
        "recharge": "long"
      }
    },
    {
      "id": "feat-darkvision",
      "name": "Darkvision",
      "source": {
        "type": "species",
        "name": "Orc"
      },
      "activation": "passive",
      "description": "You have Darkvision with a range of 120 feet."
    },
    {
      "id": "feat-alert",
      "name": "Alert",
      "source": {
        "type": "feat",
        "name": "Criminal background"
      },
      "activation": "passive",
      "description": "_Initiative Proficiency._ When you roll Initiative, you can add your Proficiency Bonus to the roll. Already counted in the Initiative on the sheet.\n\n_Initiative Swap._ Immediately after you roll Initiative, you can swap your Initiative with the Initiative of one willing ally in the same combat. You can't make this swap if you or the ally has the Incapacitated condition."
    }
  ],
  "attacks": [
    {
      "id": "atk-emberwood-longbow",
      "name": "Emberwood Longbow",
      "ability": "dex",
      "proficient": true,
      "bonus": 3,
      "damage": "1d8",
      "damageType": "Piercing",
      "addAbilityToDamage": true,
      "damageBonus": 1,
      "mastery": "Slow",
      "notes": "Range 150/600 ft. Bonus: +1 magic weapon, +2 Archery.",
      "itemId": "item-emberwood-longbow"
    },
    {
      "id": "atk-shortsword",
      "name": "Shortsword",
      "ability": "finesse",
      "proficient": true,
      "bonus": 0,
      "damage": "1d6",
      "damageType": "Piercing",
      "addAbilityToDamage": true,
      "damageBonus": 0,
      "mastery": "Vex",
      "notes": "Finesse, Light.",
      "itemId": "item-shortsword"
    },
    {
      "id": "atk-unarmed-strike",
      "name": "Unarmed Strike",
      "ability": "str",
      "proficient": true,
      "bonus": 0,
      "damage": "1",
      "damageType": "Bludgeoning",
      "addAbilityToDamage": true,
      "damageBonus": 0,
      "mastery": "",
      "notes": "",
      "itemId": null
    }
  ],
  "spellcasting": {
    "slotsUsed": [
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ],
    "pactSlotsUsed": 0,
    "concentration": "Hunter's Mark"
  },
  "spells": [
    {
      "id": "spell-hunter-s-mark",
      "name": "Hunter's Mark",
      "level": 1,
      "source": "ranger",
      "prepared": true,
      "alwaysPrepared": true,
      "ritual": false,
      "concentration": true,
      "school": "Divination",
      "castingTime": "Bonus Action",
      "range": "90 feet",
      "components": "V",
      "duration": "up to 1 hour",
      "description": "You magically mark one creature you can see within range as your quarry. Until the spell ends, you deal an extra 1d6 Force damage to the target whenever you hit it with an attack roll. You also have Advantage on any Wisdom (Perception or Survival) check you make to find it.\n\nIf the target drops to 0 Hit Points before this spell ends, you can take a Bonus Action to move the mark to a new creature you can see within range.\n\n_Using a Higher-Level Spell Slot._ Your Concentration can last longer with a spell slot of level 3–4 (up to 8 hours) or 5+ (up to 24 hours).",
      "freeCasts": {
        "max": "ranger.favored-enemy",
        "used": 1,
        "recharge": "long"
      }
    },
    {
      "id": "spell-cure-wounds",
      "name": "Cure Wounds",
      "level": 1,
      "source": "ranger",
      "prepared": true,
      "alwaysPrepared": false,
      "ritual": false,
      "concentration": false,
      "school": "Abjuration",
      "castingTime": "Action",
      "range": "Touch",
      "components": "V, S",
      "duration": "Instantaneous",
      "description": "A creature you touch regains a number of Hit Points equal to 2d8 plus your spellcasting ability modifier.\n\n_Using a Higher-Level Spell Slot._ The healing increases by 2d8 for each spell slot level above 1."
    },
    {
      "id": "spell-ensnaring-strike",
      "name": "Ensnaring Strike",
      "level": 1,
      "source": "ranger",
      "prepared": true,
      "alwaysPrepared": false,
      "ritual": false,
      "concentration": true,
      "school": "Conjuration",
      "castingTime": "Bonus Action, which you take immediately after hitting a creature with a weapon",
      "range": "Self",
      "components": "V",
      "duration": "up to 1 minute",
      "description": "As you hit the target, grasping vines appear on it, and it makes a Strength saving throw. A Large or larger creature has Advantage on this save. On a failed save, the target has the Restrained condition until the spell ends. On a successful save, the vines shrivel away, and the spell ends.\n\nWhile Restrained, the target takes 1d6 Piercing damage at the start of each of its turns. The target or a creature within reach of it can take an action to make a Strength (Athletics) check against your spell save DC. On a success, the spell ends.\n\n_Using a Higher-Level Spell Slot._ The damage increases by 1d6 for each spell slot level above 1."
    },
    {
      "id": "spell-speak-with-animals",
      "name": "Speak with Animals",
      "level": 1,
      "source": "ranger",
      "prepared": true,
      "alwaysPrepared": false,
      "ritual": true,
      "concentration": false,
      "school": "Divination",
      "castingTime": "Action",
      "range": "Self",
      "components": "V, S",
      "duration": "10 minutes",
      "description": "For the duration, you can comprehend and verbally communicate with Beasts, and you can use any of the Influence action's skill options with them.\n\nMost Beasts have little to say about topics that don't pertain to survival or companionship, but at minimum, a Beast can give you information about nearby locations and monsters, including whatever it has perceived within the past day."
    },
    {
      "id": "spell-lesser-restoration",
      "name": "Lesser Restoration",
      "level": 2,
      "source": "ranger",
      "prepared": true,
      "alwaysPrepared": false,
      "ritual": false,
      "concentration": false,
      "school": "Abjuration",
      "castingTime": "Bonus Action",
      "range": "Touch",
      "components": "V, S",
      "duration": "Instantaneous",
      "description": "You touch a creature and end one condition on it: Blinded, Deafened, Paralyzed, or Poisoned."
    },
    {
      "id": "spell-silence",
      "name": "Silence",
      "level": 2,
      "source": "ranger",
      "prepared": true,
      "alwaysPrepared": false,
      "ritual": true,
      "concentration": true,
      "school": "Illusion",
      "castingTime": "Action",
      "range": "120 feet",
      "components": "V, S",
      "duration": "up to 10 minutes",
      "description": "For the duration, no sound can be created within or pass through a 20-foot-radius Sphere centered on a point you choose within range. Any creature or object entirely inside the Sphere has Immunity to Thunder damage, and creatures have the Deafened condition while entirely inside it. Casting a spell that includes a Verbal component is impossible there."
    },
    {
      "id": "spell-spike-growth",
      "name": "Spike Growth",
      "level": 2,
      "source": "ranger",
      "prepared": true,
      "alwaysPrepared": false,
      "ritual": false,
      "concentration": true,
      "school": "Transmutation",
      "castingTime": "Action",
      "range": "150 feet",
      "components": "V, S, M (seven thorns)",
      "duration": "up to 10 minutes",
      "description": "The ground in a 20-foot-radius Sphere centered on a point within range sprouts hard spikes and thorns. The area becomes Difficult Terrain for the duration. When a creature moves into or within the area, it takes 2d4 Piercing damage for every 5 feet it travels.\n\nThe transformation of the ground is camouflaged to look natural. Any creature that can't see the area when the spell is cast must take a Search action and succeed on a Wisdom (Perception or Survival) check against your spell save DC to recognize the terrain as hazardous before entering it.",
      "tags": [
        "control"
      ]
    },
    {
      "id": "spell-goodberry",
      "name": "Goodberry",
      "level": 1,
      "source": "ranger",
      "prepared": false,
      "alwaysPrepared": false,
      "ritual": false,
      "concentration": false,
      "school": "Conjuration",
      "castingTime": "Action",
      "range": "Self",
      "components": "V, S, M (a sprig of mistletoe)",
      "duration": "24 hours",
      "description": "Ten berries appear in your hand and are infused with magic for the duration. A creature can take a Bonus Action to eat one berry. Eating a berry restores 1 Hit Point, and the berry provides enough nourishment to sustain a creature for one day.\n\nUneaten berries disappear when the spell ends."
    }
  ],
  "inventory": {
    "items": [
      {
        "id": "item-emberwood-longbow",
        "name": "Emberwood Longbow",
        "quantity": 1,
        "equipped": true,
        "requiresAttunement": true,
        "attuned": true,
        "description": "You have a +1 bonus to attack and damage rolls made with this magic weapon (already counted in the Emberwood Longbow attack).\n\nThe bow has 3 charges and regains 1d3 expended charges daily at dawn.\n\n_Weapon (Longbow), rare (requires attunement). Homebrew: the app has no data for it, so everything it does is written here and in its powers._",
        "weight": 2,
        "charges": {
          "max": 3,
          "used": 1,
          "recharge": "dawn",
          "regain": "1d3"
        },
        "powers": [
          {
            "id": "power-ember-arrow",
            "name": "Ember Arrow",
            "activation": "free",
            "description": "When you hit a creature with an arrow from this bow, you can expend 1 charge to deal an extra 2d6 Fire damage to the target.",
            "cost": 1
          },
          {
            "id": "power-flare-shot",
            "name": "Flare Shot",
            "activation": "action",
            "description": "You loose an arrow at a point within 120 feet, where it bursts in a 20-foot-radius Sphere. Each creature in the Sphere makes a Dexterity saving throw (DC 13), taking 3d6 Fire damage on a failed save or half as much on a successful one.",
            "cost": 2
          },
          {
            "id": "power-cinder-step",
            "name": "Cinder Step",
            "activation": "reaction",
            "description": "When a creature hits you with a melee attack, you can teleport up to 15 feet to an unoccupied space you can see. Once per Long Rest; this costs no charges.",
            "uses": {
              "max": 1,
              "used": 0,
              "recharge": "long"
            },
            "tags": [
              "mobility"
            ]
          },
          {
            "id": "power-hearthlight",
            "name": "Hearthlight",
            "activation": "passive",
            "description": "While you hold the bow, you can make it shed Bright Light in a 10-foot radius and Dim Light for an additional 10 feet, or put the light out (no action required)."
          }
        ],
        "tags": [
          "bow"
        ]
      },
      {
        "id": "item-shortsword",
        "name": "Shortsword",
        "quantity": 1,
        "equipped": true,
        "requiresAttunement": false,
        "attuned": false,
        "description": "Martial melee weapon. Finesse, Light. Mastery: Vex.",
        "weight": 2
      },
      {
        "id": "item-studded-leather-armor",
        "name": "Studded Leather Armor",
        "quantity": 1,
        "equipped": true,
        "requiresAttunement": false,
        "attuned": false,
        "description": "Light armor: AC 12 + Dexterity modifier.",
        "weight": 13,
        "armor": {
          "base": 12,
          "dexCap": null
        }
      },
      {
        "id": "item-cloak-of-protection",
        "name": "Cloak of Protection",
        "quantity": 1,
        "equipped": true,
        "requiresAttunement": true,
        "attuned": true,
        "description": "You gain a +1 bonus to Armor Class and saving throws while you wear this cloak.",
        "weight": 1,
        "acBonus": 1,
        "saveBonus": 1
      },
      {
        "id": "item-potion-of-healing",
        "name": "Potion of Healing",
        "quantity": 2,
        "equipped": false,
        "requiresAttunement": false,
        "attuned": false,
        "description": "You regain 2d4 + 2 Hit Points when you drink this potion. Drinking it or giving it to another creature takes a Bonus Action.",
        "weight": 0.5
      },
      {
        "id": "item-spell-scroll-fog-cloud",
        "name": "Spell Scroll (Fog Cloud)",
        "quantity": 1,
        "equipped": false,
        "requiresAttunement": false,
        "attuned": false,
        "description": "Level 1 spell scroll. Spell save DC 13, attack bonus +5."
      },
      {
        "id": "item-alchemist-s-fire",
        "name": "Alchemist's Fire",
        "quantity": 2,
        "equipped": false,
        "requiresAttunement": false,
        "attuned": false,
        "description": "When you take the Attack action, you can replace one of your attacks with throwing a flask of Alchemist's Fire. Target one creature or object you can see within 20 feet of yourself. The target must succeed on a Dexterity saving throw (DC 8 plus your Dexterity modifier and Proficiency Bonus) or take 1d4 Fire damage and start burning.",
        "weight": 1,
        "activation": "action"
      },
      {
        "id": "item-arrows",
        "name": "Arrows",
        "quantity": 37,
        "equipped": false,
        "requiresAttunement": false,
        "attuned": false,
        "description": "",
        "weight": 0.05
      },
      {
        "id": "item-thieves-tools",
        "name": "Thieves' Tools",
        "quantity": 1,
        "equipped": false,
        "requiresAttunement": false,
        "attuned": false,
        "description": "",
        "weight": 1
      },
      {
        "id": "item-explorer-s-pack",
        "name": "Explorer's Pack",
        "quantity": 1,
        "equipped": false,
        "requiresAttunement": false,
        "attuned": false,
        "description": "Backpack, bedroll, 2 flasks of oil, 10 days of rations, rope, tinderbox, 10 torches, waterskin.",
        "weight": 55
      }
    ],
    "money": {
      "cp": 0,
      "sp": 14,
      "ep": 0,
      "gp": 43,
      "pp": 0
    }
  },
  "roleplay": {
    "appearance": "Tall and wiry for an orc, grey-green skin, a burn scar across the left forearm. Keeps her hair in a single long braid.",
    "personality": "Patient and dry-humoured. Counts exits before she counts friends.",
    "ideals": "Nobody should be hunted for what they owe.",
    "bonds": "Her old crew in Saltmarsh still holds a debt over her.",
    "flaws": "Cannot leave a lock unpicked.",
    "voice": "",
    "mannerisms": "",
    "goals": "Find who forged the Emberwood Longbow, and why it was left for her.",
    "backstory": "A smuggler who took to the woods when a job went wrong.\n\nThe forest turned out to suit her better than the docks ever did.",
    "allies": "",
    "notes": ""
  },
  "sessionNotes": [
    {
      "id": "note-1",
      "date": "2026-09-27",
      "title": "The toll bridge",
      "text": "Paid the troll with a riddle. Owe the ferryman a favour."
    }
  ],
  "timers": [
    {
      "id": "timer-guild-debt",
      "name": "Guild debt due",
      "days": 9,
      "start": 14,
      "note": "200 GP to the Saltmarsh crew"
    }
  ],
  "updatedAt": "2026-10-03T12:00:00.000Z"
}
```
<!-- EXAMPLE:END -->

## 12. Before you hand over the file

- [ ] `"schemaVersion": 3`, and the hero has an `id`.
- [ ] Strict JSON: no comments, no trailing commas, line breaks inside texts written as `\n`.
- [ ] Only fields from section 7.
- [ ] Hit Point maximum, Speed and final ability scores are written; nothing derived is.
- [ ] Every feature and every spell has its full text. Content from outside the SRD is written out, not referenced.
- [ ] Every `activation` is deliberate. Every spell's `castingTime` starts with Action, Bonus Action or Reaction, or
      is a longer time on purpose.
- [ ] Each limited resource has exactly one counter, with `used` showing the current state.
- [ ] Every weapon in use is `equipped`, has an attack, and the attack has `itemId`.
- [ ] At most three items are attuned; each attuned item is also equipped and requires attunement.
- [ ] Potions and scrolls are named so the app recognizes them; nothing else is named that way by accident.
- [ ] No reusable item ability sits on a bare `activation`; it is in `powers`.
- [ ] The numbers the app will calculate match the player's sheet.
- [ ] The player has the list of what you assumed, the numbers to expect, and the import steps.

---

This guide includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC,
available at <https://www.dndbeyond.com/srd>. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0
International License, available at <https://creativecommons.org/licenses/by/4.0/legalcode>.
Compatible with fifth edition. Not affiliated with or endorsed by Wizards of the Coast.

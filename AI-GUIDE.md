# Hero Deck: writing a character file

**A guide for AI assistants.** A player has given you this document because they want their Dungeons & Dragons
character in **Hero Deck**, a free character tracker that runs in the browser
(<https://itram05.github.io/DnD-Character-Manager/>). The app stores each hero as one JSON object and can import such a
file. Your job is to interview the player, then write that file so that it imports with no adjustments and nothing lost.

You have not seen the app and you cannot see its code. Everything you need is in this document. It describes
**schema version 3**, the format of the published app.

**Read sections 1 to 9 before you write anything.** They end with a checklist. The long JSON example (section 10)
comes after them, so a reader that is cut off part-way through the example has still seen every rule. After the
example there are three short sections for special cases only: the 2014 rules (11), the lists the app writes itself
(12: journal, XP log, timers, recipes, images), and changing a file the app exported (13).

## 1. Ground rules

- **Speak the player's language.** Talk to the player in whatever language they write to you. Inside the file, rules
  content is in English (spell and feature names, conditions, "Bonus Action", damage types): the app reads some of
  those words. What belongs to the player stays as they wrote it, in any alphabet: the hero's `name`, `player`, the
  `roleplay` texts and notes.
- **Assume the 2024 rules** (D&D 5e, 2024 Player's Handbook / SRD 5.2). Say so once. Only if the player says their
  table plays the 2014 rules, read section 11.
- **Ask in small rounds**, not one long questionnaire.
- **Derive what the rules fix; never choose what the player chooses.** Every unknown is one of three kinds:

  | The unknown | What you do |
  |---|---|
  | **The rules fix it** once you know class, level, species and background: class features, species traits, the background's feat, the fixed Hit Points per level, a counter's maximum. | Work it out yourself. That is not inventing. |
  | **The player chose it**, or their DM did: which spells, which Fighting Style, which feat at level 4, what a homebrew item does. | Ask once. If they still do not know, do **not** pick for them: leave the choice out (the feature stays, with its general text and no pick) and list it as open. |
  | **A fact about the person or the story**: `player`, `alignment`, the `roleplay` texts. | Leave it `""`. An empty text is a correct value. |

  The "sensible default" is only for bookkeeping the app needs and the player rarely cares about: XP at the level's
  threshold, `partySize` 5, size Medium, a fresh state after a Long Rest.
- **The output is one JSON file**, strict JSON, nothing else in it (section 8).

## 2. How to run the conversation

**Start from what the player already has.** Ask first whether the character is written down anywhere: a PDF or photo
of the sheet, a D&D Beyond page, notes. If so, read it, show a short summary of what you understood, and ask **only**
for what is missing or unclear. A player who uploads a full sheet should get three or four questions, not thirty.
(If what they have is a file exported from Hero Deck, read section 13.)

Otherwise build the hero in these rounds. Offer your best reading wherever you can work one out ("a level 5 Ranger
prepares 6 spells; which ones?") instead of asking open questions.

1. **Identity.** Hero's name, player's name, species (and lineage), background, alignment. In the 2024 rules the
   **background** gives three ability score increases and an **Origin feat** (Acolyte: Magic Initiate (Cleric);
   Criminal: Alert; Sage: Magic Initiate (Wizard); Soldier: Savage Attacker; for other backgrounds ask). The feat is a
   feature like any other, and if it has choices (the spells of Magic Initiate), ask for them.
2. **Class and level.** Class, subclass, level. For a multiclass hero: every class with its level, and which was taken
   **first**. XP total, or "we level by milestones". How many players share XP.
3. **Numbers.** The six ability scores as they stand now, Hit Point maximum, Speed. Skill proficiencies and Expertise,
   tools, languages.
4. **Features.** Work the list out yourself from class, subclass, level, species, background and feats, show it by
   name, and ask only for the choices (Fighting Style, Divine Order, Weapon Masteries, Metamagic, Invocations, feats)
   and for anything homebrew.
5. **Spells** (casters only). Cantrips, prepared spells, always-prepared spells (subclass, species, feats), free casts.
6. **Equipment.** Armor and shield, weapons, magic items (attuned or not, charges, exact text), potions and scrolls,
   other gear worth listing, coins.
7. **Where things stand right now.** Current Hit Points, slots spent, features and charges used, Hit Point Dice
   spent, conditions, Exhaustion. If the player does not care: fresh after a Long Rest.
8. **Story** (optional, offer to skip).

**Homebrew or unclear text.** Ask for a photo or a paste. If there is none, write what the player remembers and end
that description with "(from memory, check with the DM)".

**Hit Points.** The player's number wins; write it. If they do not know it, calculate: the hit die's maximum at
level 1, then the fixed value per level (d6: 4, d8: 5, d10: 6, d12: 7), plus the Constitution modifier per level, plus
per-level bonuses (Dwarf +1, Tough +2, Draconic Sorcerer +1). If their number and your calculation disagree, still
write theirs, and tell them the difference: it is usually rolled Hit Points, sometimes a forgotten bonus.

**Skills, tools, languages.** Write the ones the player named, and only those. Know how many the rules give (class,
background, species, feats), count, and if the player named fewer or more, tell them and list it as open. Do not
fill the gap with proficiencies of your choosing, and do not add the background's skills on your own if the player's
list leaves them out.

**Check your work against the sheet.** Before you write the file, work out what the app will show (Armor Class, Initiative, attack bonuses, spell save DC,
spell slots) and compare with the player's sheet. If the sheet says AC 18 and your data gives 17, something is
missing (a shield, a Fighting Style, a magic item). Find it and fix the **data**.

**With Exhaustion, the app shows the numbers already lowered.** Under the 2024 rules it takes 2 per level off
Initiative, saving throws, skills, passive scores, every attack card and the spell attack, and 5 feet per level off
Speed; the spell save DC and Armor Class do not change. A hero with Exhaustion 1, Dexterity +2 and Speed 35 shows
Initiative +0 and Speed 30. Still write the full `combat.speed` (35) and no minus anywhere in the file. In "What
you should see", give the lowered numbers and say which they are. (2014 rules: Disadvantage marks instead of a
minus, section 11.)

**Closing.** Give the player, in this order:

1. The file.
2. **"What I worked out and what is open"**: every default you used, and every choice you left out because the
   player did not know. Put the open points in `roleplay.notes` too, so they are in the app; keep them out of the
   card texts.
3. **"What you should see"**: AC, Initiative, spell save DC, slots per level, attack bonuses, Hit Point maximum.
4. How to import it (section 8).

## 3. What the app is

Hero Deck is a tracker for the table, not a rules engine or a character builder. Its heart is the **Play** tab
(the others: Stats, Spells, Gear, Features, Story, Images, Level Up, Edit, Rules). Everything the hero can *do* is a **card**, sorted into four **hands** by what it costs:
Action, Bonus Action, Reaction, and Free / Other. A card with limited uses shows them as pips; using the last one
"taps" the card. Short Rest and Long Rest buttons give back what they restore. Spell slots, Concentration and the
healing potions have their own panels. Passive features are small chips on an **Always on** strip.

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

So the choices that matter most are `activation` (which hand) and the counters (`uses`, `charges`, `freeCasts`):
a reaction filed as an action is a card the player will not find when they need it.

**Cards know about each other in one way only.** A feature can spend another feature's uses (`poolId`, section 6:
Turn Undead spends Channel Divinity), and an item's power spends that item's charges. That is all: no card pays with
a spell slot unless it is a spell, no card gives anything back, and the app tracks no hands, action economy or
prerequisites. Where two things belong together beyond that, the text says so.

**What a card cannot do, its text must say.** Write the missing step as the last paragraph of the card's
`description`, as an instruction to the player:

- **A price that is one of two things** (Wild Companion: a spell slot or a use of Wild Shape). Link the card to the
  pool it usually spends (`poolId`), and write: "This card spends a use of Wild Shape. If you pay with a spell slot
  instead, mark the slot on the spell slot panel and do not press Use here."
- **An option that gives a use back to a pool** (Wild Resurgence: a spell slot for a use of Wild Shape). No `poolId`
  (it would spend, not restore) and no `uses`. Write: "The app does not do this: mark the spell slot as spent, and
  give one use back on the Wild Shape card."
- **An option that gives a spell slot** (Wild Resurgence the other way, a Wizard's Arcane Recovery). `poolId` or
  `uses` for what it costs, and: "The app does not add the slot: give one spent level 1 slot back on the spell slot
  panel." The panel cannot hold more slots than the class table gives, so with none spent the player has to remember
  the extra one. Only a Sorcerer's Font of Magic makes slots in the app itself.
- **Stat blocks** (Wild Shape forms, a familiar, a summoned creature, a mount). The app has no place for a creature.
  Put each one in the `description` of the card that uses it (the forms in "Wild Shape: Beast Form"), as a
  sub-heading and a short table, after the rule itself; forms the player has not chosen yet are an open point.

## 4. What the app calculates, and what you must write

A derived number has no field; adding a field of your own for it only produces an "unknown field" notice.

**Calculated by the app.**

- Ability modifiers (from the score with the `abilityScores` of active items applied), Proficiency Bonus, saving
  throws (plus `saveBonus` of active items), skills, passive scores.
- Initiative: Dexterity modifier + `combat.initiativeBonus`.
- Armor Class: the equipped armor's base + Dexterity (capped), or the `unarmoredAc` formula with no armor; plus
  `acBonus` of every active item, plus `combat.acBonus`.
- Each attack: ability modifier + Proficiency Bonus (if proficient) + `bonus`; damage modifier likewise.
- Spell save DC (8 + modifier + Proficiency Bonus + item bonuses) and spell attack bonus, per casting class.
- Spell slots (2024 class tables and multiclass rule), Pact Magic slots, the pool of Hit Point Dice, a counter's
  maximum written as a formula, the effects of Exhaustion, XP to the next level, total weight.

**Not calculated. You must write these.**

- **Hit Point maximum** (`combat.hp.max`), with everything in it. See "Hit Points" in section 2.
- **Speed** (`combat.speed`), with every permanent bonus in it.
- **Ability scores**: the hero's own final scores. The app adds nothing to them, not background, feats or level-ups.
  The one exception is a magic item worn now: that goes in the item's `abilityScores`, not in the score (see
  [items](#items)).
- **Every feature, as text.** A "Fighter 5" in the file does not get Second Wind. The `features` list is the whole
  truth: a feature you leave out does not exist in the app.
- **Every spell, as text.** A spell with only a name is a card with no text.
- **Attacks.** Each weapon or attack the player wants as a card is an entry in `attacks`. The app does not make one
  from a weapon in the inventory.
- **Bonuses that do not come from an item**: Fighting Style Defense (+1) in `combat.acBonus`; Archery (+2) in the
  `bonus` of each ranged attack; Alert in `combat.initiativeBonus` as a plain number (tell the player to raise it when
  the Proficiency Bonus goes up, at levels 5, 9, 13, 17).
- **Unarmored Defense**: the formula in `combat.unarmoredAc` (Barbarian `"10 + dex + con"`, Monk `"10 + dex + wis"`,
  Draconic Sorcery `"10 + dex + cha"`).
- **A magic weapon's +1**: `bonus` and `damageBonus` of its attack.
- Resistances, senses, languages, tool proficiencies: text only (a feature, or the `proficiencies` texts).

## 5. Content from outside the free rules

The app ships only the **System Reference Document 5.2.1** (the 2024 SRD): 12 classes with one subclass each, 9
species, 4 backgrounds, 17 feats, 339 spells. That matters less than it sounds: **the importer fills in no rules text
for anything, SRD or not.** You write every feature, spell and item into the file. The app's own data is used only for:

- **The 12 classes** (`barbarian bard cleric druid fighter monk paladin ranger rogue sorcerer warlock wizard`): hit
  die, saving throws, spell slots, spellcasting ability, class-table formulas. Any other class (Artificer, homebrew)
  needs `hitDie`, `casterType` and `spellcastingAbility` on its class entry, and `proficiencies.savingThrows`.
- **The spell list**: the text of a spell scroll whose spell the hero does not have (section 7).

Subclasses, species, backgrounds and feats are not looked up at all: `subclass` is free text. Only a subclass that
gives spellcasting to a non-caster (Eldritch Knight, Arcane Trickster) leaves a trace: `"casterType": "third"` and
`"spellcastingAbility": "int"` on the class entry.

The file is the player's own notes about their own character: ask them to paste or photograph the text. If you would
rather not reproduce a passage word for word, write it in your own words, keeping **every number, range, duration,
saving throw, condition and limit**. Never leave a description empty and never write "see the Player's Handbook,
page 87": at the table the card is all the player has.

## 6. The file format

One JSON object. The **Write** column says what a good file contains. The importer itself requires nothing (`{}`
imports as an empty level 1 hero) and a missing field takes the default; a default is a fallback, not a goal. Write
the **current** state of the hero: what they are, and where they stand in the session.

### Formulas

Wherever a type says *formula*, write a plain number, or a text the app evaluates each time:

| In a formula | Means |
|---|---|
| `str` `dex` `con` `int` `wis` `cha` | the ability **modifier** |
| `str_score` ... `cha_score` | the ability **score** |
| `pb` | Proficiency Bonus |
| `level` | total character level |
| a class id of the hero: `paladin`, `wizard` | the hero's level in that class |
| `class.column`: `barbarian.rages` | that column of the SRD (2024) class table at the hero's class level |
| `+ - * /`, `( )`, `min()`, `max()`, `floor()`, `ceil()` | arithmetic |

Columns: Barbarian `rages`, `rage-damage`; Bard, Cleric, Druid, Sorcerer, Warlock, Wizard `cantrips`; every caster
class `prepared-spells`; Cleric and Paladin `channel-divinity`; Druid `wild-shape`; Fighter `second-wind`; Monk
`focus-points`, `unarmored-movement`; Ranger `favored-enemy`; Sorcerer `sorcery-points`; Warlock
`eldritch-invocations`; Barbarian and Fighter `weapon-mastery`.

Prefer a formula when the value grows with the hero: `"pb"` is still right after the next level-up. But **a name
the app does not know counts as 0, with no warning**: `"profbonus"` gives a feature with no uses.

The usual 2024 counters:

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
| A trait usable Proficiency Bonus times | `{ "max": "pb", "used": 0, "recharge": "long" }` |

### Text fields

Every `description` is plain text with a little formatting. Inside a JSON string a line break is `\n`.

- A blank line (`\n\n`) starts a new paragraph. `**bold**` and `_italic_` work; italic is the convention for a
  sub-heading: `_Using a Higher-Level Spell Slot._`
- A block whose lines all start with `• ` or `- ` is a bullet list. A block whose lines all start with `|` is a
  table (`| Level | Damage |\n| 5 | 2d8 |`); the first line is the head. Leave out the Markdown separator line
  (`|---|---|`); if one is there it is skipped.
- Nothing else: no `#` headings, no links, no HTML.
- **Lead with the rule.** A card's face shows only the first 140 characters or so. Flavour and remarks go last.
- **Use the game's own wording.** The app reads the text to highlight it, to put small icons on spell and item-power
  cards (range, area, damage, healing, save) and to add filter tags: "8d6 Fire damage", "Dexterity saving throw",
  "20-foot-radius Sphere", "regains 2d8 Hit Points", "within 30 feet".

### Ids

Features, attacks, spells, items, item powers, notes, timers and the hero itself each have an `id`. Write them as
short readable texts in lowercase Latin letters, digits and dashes, unique in the file (`"feat-second-wind"`,
`"item-longbow"`): an attack points at its weapon by the item's id, and the hero's own `id` is how the app knows, on a
later re-import, that it is the same hero. Give the hero an id nobody else will have: the name (transliterated if it
is not in Latin letters) plus a few random characters, `"hero-vessa-thornhide-7k2q9d"`.

### Top level

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `schemaVersion` | number | always | 1 | Write `3`. Without it the file is read as the oldest format. A higher number is refused. |
| `id` | text | always | generated | See [Ids](#ids). |
| `name` | text | always | "Unnamed hero" | As the player writes it; any alphabet. |
| `player` | text | optional | "" | |
| `species` | `{ name, size }` | always | `{ "", "Medium" }` | `name`: free text ("Elf (Wood Elf)"). `size`: "Medium", "Small". (`race` is read as an alias; write `species`.) |
| `background` | text | always | "" | Free text. |
| `alignment` | text | optional | "" | Free text. |
| `xp` | number ≥ 0 | always | 0 | Total experience points. See below. |
| `partySize` | 1–20 | optional | 5 | How many players share the XP the DM gives the group. |
| `classes` | list | always | Fighter 1 | See [classes](#classes). |
| `abilities` | object | always | all 10 | See [abilities](#abilities). |
| `proficiencies` | object | always | | See [proficiencies](#proficiencies). |
| `combat` | object | always | | See [combat](#combat). |
| `conditions` | list of text | if it applies | [] | Lowercase: `blinded` `charmed` `deafened` `frightened` `grappled` `incapacitated` `invisible` `paralyzed` `petrified` `poisoned` `prone` `restrained` `stunned` `unconscious`. Not Exhaustion. |
| `exhaustion` | 0–6 | if it applies | 0 | Exhaustion level. Its effects are applied automatically. |
| `exhaustionRules` | `"2014"` | 2014 only | absent = 2024 | Section 11. Leave it out for a 2024 hero. |
| `heroicInspiration` | true/false | optional | false | |
| `features` | list | always | [] | See [features](#features). |
| `attacks` | list | always | [] | See [attacks](#attacks). |
| `spellcasting` | object | casters | all 0 | See [spellcasting](#spellcasting). |
| `spells` | list | casters | [] | See [spells](#spells). |
| `inventory` | `{ items, money, containers, categories }` | always | empty | See [items](#items), [containers](#containers) and [money](#money). |
| `roleplay` | object | optional | all "" | See [roleplay](#roleplay). |
| `xpLog`, `sessionNotes`, `timers`, `recipes`, `playCounters` | lists | `[]` in a new file | [] | The app's XP history, the player's journal, day countdowns, crafting recipes, items pinned as counters. Section 12. |
| `preferences` | object | exactly as here | defaults | How the Gear tab is laid out. Always this: `{ "gear": { "view": "hybrid", "groupBy": "container", "show": { "quantity": true, "weight": true, "category": true, "tags": true, "charges": true } } }`. Left out, the app fills in the same values, with no adjustment. |
| `images` | list | **never** | absent | Maps and pictures the player added in the app. You do not write them, and you never drop them from an exported file. Section 12. |
| `updatedAt` | ISO date-time text | optional | now | `"2026-10-03T12:00:00.000Z"`. The hero list is sorted by it. |

**XP.** The app offers a level-up when `xp` reaches the next threshold. If the table levels by milestones, or the
player does not know the XP, write the threshold of the **current** level.

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| XP | 0 | 300 | 900 | 2700 | 6500 | 14000 | 23000 | 34000 | 48000 | 64000 |

| Level | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|
| XP | 85000 | 100000 | 120000 | 140000 | 165000 | 195000 | 225000 | 265000 | 305000 | 355000 |

### classes

A list, one entry per class. **The first entry is the class the hero started in.**

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `id` | text | always | | For the 12 SRD classes, the lowercase English name (`"ranger"`): it connects the hero to the class table. For any other class, a lowercase id of your own (`"artificer"`). |
| `name` | text | always | the SRD name | Shown on the sheet ("Ranger"). |
| `level` | 1–20 | always | 1 | The levels of all classes must not add up to more than 20. |
| `subclass` | text | if it applies | absent | Free text. |
| `hitDie` | number | non-SRD classes only | from the SRD; else 8 | `8` for a d8. Without it a non-SRD class is assumed d8, with an adjustment. |
| `casterType` | `full` `half` `third` `pact` `none` | see note | from the SRD | How the class counts toward spell slots. |
| `spellcastingAbility` | an ability id | with `casterType` | from the SRD | |

Write `casterType` and `spellcastingAbility` in exactly two cases: a class that is not in the SRD, and a non-caster
class whose subclass casts spells. On an ordinary SRD caster leave both out: with `casterType` set, the app stops
using the class's own slot table and falls back to a generic one.

### abilities

`{ "str": 10, "dex": 18, "con": 14, "int": 12, "wis": 15, "cha": 8 }`

All six of `str` `dex` `con` `int` `wis` `cha`, always. Scores from 1 to 30, final values. Default 10 each.

### proficiencies

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `savingThrows` | list of ability ids | always | the first class's | `["str", "dex"]`. Include a save gained from a feat (Resilient). |
| `skills` | object | always | none | Only the trained skills: `{ "stealth": "expertise", "perception": "proficient" }`. |
| `jackOfAllTrades` | true/false | Bards level 2+ | false | Adds half the Proficiency Bonus to untrained skills. |
| `armor` | text | optional | "" | Shown as written: "Light and Medium armor, Shields". |
| `weapons` | text | optional | "" | "Simple and Martial weapons". |
| `tools` | text | optional | "" | "Thieves' Tools". |
| `languages` | text | optional | "" | "Common, Elvish". |
| `weaponMasteries` | list of text | if it applies | [] | `["Longbow (Slow)", "Shortsword (Vex)"]`. Shown as written. |

Skill ids, exactly: `acrobatics` `animalHandling` `arcana` `athletics` `deception` `history` `insight`
`intimidation` `investigation` `medicine` `nature` `perception` `performance` `persuasion` `religion`
`sleightOfHand` `stealth` `survival`. Values: `"proficient"` or `"expertise"`.

### combat

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `hp` | `{ max, current, temp }` | always | 10 / max / 0 | `max`: the Hit Point maximum (not calculated, not checked). `current`: 0 to `max`. `temp`: Temporary Hit Points. |
| `speed` | number | always | 30 | Walking Speed in feet. Exhaustion is subtracted by the app. |
| `unarmoredAc` | formula | always | `"10 + dex"` | Armor Class when no body armor is equipped. |
| `acBonus` | number | always | 0 | AC bonus that does not come from an item (Fighting Style Defense). |
| `initiativeBonus` | number | always | 0 | Added to the Dexterity modifier (Alert: the Proficiency Bonus as a number). |
| `hitDiceUsed` | object | always | {} | Hit Point Dice **spent**, by die: `{ "d10": 1 }`. Nothing spent is `{}`, which is what the app writes after a Long Rest. The pool is calculated. |
| `deathSaves` | `{ successes, failures }` | always | 0 / 0 | Each 0–3. |

### features

A list: class and subclass features, species traits, the background's feat, other feats, boons, anything that is a
rule about this hero.

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
| `poolId` | text | options of a pool | absent | The `id` of **another feature in this list** whose `uses` this one spends: Turn Undead names Channel Divinity. The card then shows that counter, and its Use button spends from it. The feature named must have `uses`. See "A pool with options" below. |
| `cost` | whole number ≥ 1 | with `poolId` | 1 | How many of the pool's uses one use takes. Only together with `poolId`. |

| `activation` | Use it for | Where it shows |
|---|---|---|
| `passive` | Always on, nothing to do: Darkvision, Extra Attack, a Fighting Style | A chip on the Always on strip |
| `action` | Takes an action, including a Magic action | Action hand |
| `bonus` | Takes a Bonus Action | Bonus Action hand |
| `reaction` | Takes a Reaction | Reaction hand |
| `free` | No action, but the player decides to use it: Reckless Attack, Action Surge, Sneak Attack, Metamagic | Free / Other hand |
| `special` | Something else: a trigger, part of a rest, a pool that other cards draw on | Free / Other hand |

**How finely to split: one card per decision the player makes at the table.**

- **A feature that only changes another one goes into that one's text**, under an italic sub-heading, and gets no
  entry of its own. Sear Undead is a paragraph of Turn Undead; Improved Divine Smite is a paragraph of Divine Smite.
  Two entries would say the same thing in two places.
- **A pool with options** (Channel Divinity, Wild Shape, Monk's Focus, Bardic Inspiration with several ways to spend
  it, a Battle Master's Superiority Dice): one card for the pool, with `activation: "special"` and the counter, plus
  one card per option with the option's real activation and **no** `uses` of its own. Each option names the pool:
  `"poolId": "<the pool feature's id>"` and `"cost": 1` (2 or more when one use takes more, as some Focus options
  do). The option's card then shows the pool's counter, its Use button spends from the pool, and it goes dark when
  the pool has less than its cost. `poolId` is the pool's **`id`**, not its name, so give the pool feature an `id`
  you can repeat exactly. An id that matches no feature is dropped with an adjustment and the card spends nothing.
  Give an option `uses` of its own only when it really has a second limit ("once per Long Rest, and it expends a
  use of Channel Divinity"): then both are spent. Section 7 has a worked fragment.
- Features that only record a choice already expressed in numbers (Ability Score Improvement, "Spellcasting",
  "Cleric Subclass") can be left out. So can a "Domain Spells" feature: the spells themselves carry it (see
  [spells](#spells)).
- A feat whose picks the player could not name (Magic Initiate, spells unknown) stays in the list with its general
  text; the missing picks are an open point (section 1), not something to fill in.

A feature granted by a magic item: `source` is `{ "type": "item", "name": "<the item's exact name>" }`. It then
appears and disappears with that item. For an item's own abilities prefer `powers` on the item.

### Counters

One shape for a feature's `uses`, an item's `charges`, an item power's `uses`, and a spell's `freeCasts`.

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `max` | formula | always | 1 | How many there are. |
| `used` | number ≥ 0 | always | 0 | How many are spent **now** (not how many are left). Not checked against `max`; keep it at or below. |
| `recharge` | see below | always | `long` | When the Rest buttons give them back. |
| `shortRestRegain` | formula | if it applies | absent | With `recharge: "long"`: how many come back on a Short Rest (`1` for Rage, Channel Divinity, Wild Shape, Second Wind). |
| `regain` | text | if it applies | absent | A roll, such as `"1d6+1"`. **With this set, rests do not refill the counter**; they remind the player to roll. Leave it out when everything simply comes back. |
| `note` | text | optional | absent | A label next to the counter: "HP pool". |
| `resource` | `"sorcery-points"` | Sorcerers | absent | Marks the Sorcery Points counter, so the app shows it beside the spell slots. It is the only value. |

`recharge`: `short` (a Short or a Long Rest), `long`, `dawn` (magic items; a Long Rest counts as a dawn unless the
player unticks that), `other` (never automatic: "once every 7 days"), `none` (never comes back).

**One counter per resource.** Favored Enemy lets a Ranger cast Hunter's Mark without a slot: that is `freeCasts` on
the Hunter's Mark spell, and the Favored Enemy feature is passive with **no** `uses`. The same goes for Magic
Initiate, species spells, an item whose power spends the item's charges (`cost`, not a second counter), and a
feature that spends another feature's uses (`poolId` and `cost`, not a second counter; see
[features](#features)).

### attacks

A list. Each entry is a card in the Action hand.

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `id` | text | always | generated | |
| `name` | text | always | "Attack" | |
| `ability` | `str` `dex` `con` `int` `wis` `cha` `finesse` `spell` | always | `str` | `finesse` = the better of Strength and Dexterity. `spell` = the spellcasting ability of the first caster class. |
| `proficient` | true/false | always | true | Adds the Proficiency Bonus to the attack roll. |
| `bonus` | number | always | 0 | Extra to hit: a +1 weapon, Archery's +2. |
| `damage` | text | always | "" | **Dice only**: `"1d8"`. The app appends the modifier itself. |
| `damageType` | text | always | "" | "Piercing", "Fire". |
| `addAbilityToDamage` | true/false | always | true | False for an off-hand attack without the Two-Weapon Fighting style, and for most spell attacks. |
| `damageBonus` | number | always | 0 | Extra damage: a +1 weapon, Dueling's +2. |
| `mastery` | text | optional | "" | The weapon's mastery property, if the hero can use it: "Vex". |
| `notes` | text | optional | "" | Range, properties, riders: "Range 150/600 ft.", "Versatile (1d10)". |
| `itemId` | text or null | always | linked by name | The `id` of the item this attack is made with, or `null` for none (Unarmed Strike). Left out, the importer guesses by name and reports an adjustment. |

A cantrip that needs an attack roll (Fire Bolt) is a spell. If the player uses it every turn, you may **also** add it
to `attacks` with `"ability": "spell"`, `"addAbilityToDamage": false`, `"itemId": null`, so a card shows the bonus.
Such a card is ability modifier + Proficiency Bonus + `bonus` + the `spellAttackBonus` of every active item: the
same number as the spell attack shown beside the save DC. So leave an item's bonus **out** of this attack's `bonus`
(it would count twice); `bonus` is only for what no item field carries.

### spellcasting

The state of the hero's magic, not their spells.

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `slotsUsed` | list of 9 numbers | casters | all 0 | Slots **spent** per spell level; the first number is level 1. |
| `pactSlotsUsed` | number | Warlocks | 0 | Pact Magic slots spent. |
| `concentration` | text | if it applies | "" | The name of the spell the hero is concentrating on now. |
| `slotsOverride` | list of numbers | rarely | absent | Replaces the calculated slots: `[4, 3, 2]`. For homebrew and for 2014 (section 11). Otherwise leave it out. |
| `pactOverride` | `{ slots, level }` | rarely | absent | The same for Pact Magic. |
| `bonusSlots` | list of 9 numbers | leave out | absent | Slots a Sorcerer made from Sorcery Points; the app writes and clears it. |

### spells

A list. Every spell the hero can cast, or has in a spellbook.

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `id` | text | always | generated | |
| `name` | text | always | "Unnamed spell" | |
| `level` | 0–9 | always | 0 | 0 = cantrip. |
| `source` | text | always | absent | The `id` of the class the spell belongs to, exactly (`"ranger"`). For a spell from elsewhere: `"feat"`, `"species"`, `"item"`. It is a label and decides which class's limits the spell counts toward; it does **not** choose a spellcasting ability (see below). |
| `prepared` | true/false | always | true | A prepared spell is a card on Play. `false`: only on the Spells tab (a Wizard's spellbook). Cantrips are always cards. |
| `alwaysPrepared` | true/false | always | false | Granted by a subclass, species or feat: always a card, marked ★, not counted against the class's limit. |
| `ritual` | true/false | always | false | |
| `concentration` | true/false | always | false | Casting it puts it in the Concentration slot. |
| `school` | text | always | "" | "Evocation". |
| `castingTime` | text | always | "" | **Must start with** `Action`, `Bonus Action` or `Reaction`: that decides the hand. Write "Action" even where a book says "1 action", which does not match. Any other text ("1 minute") goes to Free / Other. Extra words may follow: "Reaction, which you take when you are hit". |
| `range` | text | always | "" | "60 feet", "Self", "Touch". |
| `components` | text | always | "" | "V, S, M (a pinch of dirt)". |
| `duration` | text | always | "" | "Instantaneous", "up to 1 minute". Concentration is the flag, not this text. |
| `description` | text | always | "" | The full effect, including what a higher-level slot does. |
| `freeCasts` | [counter](#counters) | if it applies | absent | Casts that need no slot: Magic Initiate, a species spell, Favored Enemy's Hunter's Mark. |
| `tags` | list of text | optional | absent | See [Tags](#tags). |

- **Always-prepared spells** (domain, oath, circle, species, feat): write `"prepared": true` **and**
  `"alwaysPrepared": true`, with the class's id as `source` if the subclass gives them. Nothing else is needed.
- **How many are prepared.** The limit is not in the file. The Spells tab shows "Prepared n/max" per class, taking
  max from the 2024 class table and counting the spells with that class's `source`, level 1+, `prepared` and not
  `alwaysPrepared`. Nothing is refused, on import or later. So know the limit yourself, count, and if the player named
  fewer or more, tell them; do not fill the gap with spells of your choosing.
- **Cantrips.** The Spells tab shows "Cantrips n/max" per class, counting the cantrips with that class's `source`
  that are not `alwaysPrepared`: the same rule as for prepared spells. So a cantrip that does not count against the
  class's number gets `"alwaysPrepared": true` and the class's id as `source` if a subclass gives it (Circle of the
  Moon's Starry Wisp), or `source` `"species"` or `"feat"` if it comes from there. Nothing is refused.
- **Save DC and spell attack of a spell.** The app works these out **per casting class only** and shows them in
  the head and on the Spells tab; a spell card carries no numbers of its own. A spell with `source` `"species"`,
  `"feat"` or `"item"` gets no DC from the app. If it uses the same ability as the hero's class, nothing more is
  needed. If it uses another ability, or the hero has no casting class, work the numbers out and end the spell's
  `description` with them: "Spell save DC 13, spell attack +5 (Intelligence)."
- **One spell, two origins** (Pass without Trace from the Druid list and from Wood Elf): **one** entry, never two.
  Two entries are two cards for one spell. Give it the `freeCasts` and `alwaysPrepared` the second origin brings,
  and the class's id as `source` only if the player also prepares it as a class spell; otherwise `"species"` or
  `"feat"`. The card is cast with the free cast or with any slot either way.
- **Cantrip damage.** Write the **level 1** die in the main text ("1d8 Radiant damage") and keep the upgrade
  paragraph, starting `_Cantrip Upgrade._` and naming level 5: "The damage increases by 1d8 when you reach levels 5
  (2d8), 11 (3d8), and 17 (4d8)." The card's damage icon then shows the right dice for the hero's level and keeps
  growing. Dice you scale yourself ("2d8") are shown as written and go stale at level 11.

### items

`inventory.items` is a list of everything the hero carries.

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `id` | text | always | generated | |
| `name` | text | always | "Item" | Published items: the English name. A homebrew item keeps the name the player gave it, in any alphabet; do not translate it. Some words in a name have meaning; see [Names the app reads](#names-the-app-reads). |
| `quantity` | number ≥ 0 | always | 1 | |
| `equipped` | true/false | always | false | Worn, wielded or held ready. |
| `requiresAttunement` | true/false | always | false | |
| `attuned` | true/false | always | false | At most 3 items. A fourth is un-attuned by the importer, with an adjustment: ask the player which three. |
| `description` | text | always | "" | What it is and does. |
| `weight` | number | optional | absent | Pounds **per piece**. |
| `armor` | `{ base, dexCap }` | body armor | absent | `base`: the armor's AC. `dexCap`: the most Dexterity it allows: `null` = no limit (light), `2` (medium), `0` (heavy). |
| `acBonus` | number | if it applies | absent | Added to AC while the item is active. A Shield is an item with `"acBonus": 2` (no `armor`). |
| `saveBonus` | number | if it applies | absent | Added to every saving throw while active (Cloak of Protection: 1). |
| `spellDcBonus` | number | if it applies | absent | Added to the spell save DC while active. |
| `spellAttackBonus` | number | if it applies | absent | Added to spell attack rolls while active: the spell attack beside the save DC and every attack with `"ability": "spell"`. |
| `abilityScores` | list of `{ ability, mode, value, max }` | if it applies | absent | What the item does to ability scores while active. `ability`: one of the six ids. `mode` `"set"`: the score **becomes** `value` unless it is already higher (Amulet of Health: `{ "ability": "con", "mode": "set", "value": 19 }`). `mode` `"add"`: the score goes up by `value`, but not above `max` (Belt of Dwarvenkind: `{ "ability": "con", "mode": "add", "value": 2, "max": 20 }`); leave `max` out for 20, write 30 for an item with no limit. `max` is for `"add"` only. Everything the app calculates from the score follows; a chip under "Always on" names it. |
| `saveDc`, `spellAttack` | numbers | rarely | absent | **Spell scrolls only**: the scroll's own save DC and spell attack bonus, in place of the Spell Scroll table. Leave both out for an ordinary scroll of a spell the hero or the SRD has; see [Names the app reads](#names-the-app-reads). |
| `charges` | [counter](#counters) | if it applies | absent | The item's pool of charges. |
| `activation` | as for features | if it applies | absent | Makes the item itself a card that spends `quantity`. Consumables only; see the table below. |
| `powers` | list | if it applies | absent | The item's separate abilities. See [item powers](#item-powers). |
| `tags` | list of text | optional | absent | See [Tags](#tags). They also apply to every power of the item. |
| `containerId` | text | always | the first container | The `id` of the [container](#containers) the item is kept in. Where it is stored, not whether it is worn: `equipped` decides that. |
| `category` | text | leave out | guessed | The app sorts items into `weapon`, `armor`, `magic`, `scroll`, `potion`, `material`, `valuable`, `gear` by itself. Write one only where the guess would be wrong (a gem: `valuable`; a crafting material: `material`). |

**The Play rule.** An item is **active** when it is `equipped`, and `attuned` too if it `requiresAttunement`. Only an
active item is on the Play screen (its card, powers, chips, the attacks linked to it, the features whose `source`
names it), and only an active item's bonuses count. Potions, scrolls and quantity-spent consumables are the
exception: they are on Play without being equipped. An inactive item is one tap away on the Gear tab, but the player
will think the import lost it.

The app tracks **no hands**. Equip every weapon the hero fights with, and the shield, all at once: two weapons and a
shield together are fine, each weapon gets its attack card, and the shield's +2 always counts. Say in the attack's
`notes` what the table needs to remember ("Versatile (1d10) without the shield").

Which shape to give an item:

| The item | Write |
|---|---|
| Mundane gear (rope, rations, tools) | `name`, `quantity`, maybe `weight` and `description`. Nothing else. |
| Body armor | `armor`, `equipped: true` |
| Shield | `acBonus: 2`, `equipped: true` |
| A weapon | A plain item with `equipped: true`, **and** an entry in `attacks` whose `itemId` is this item's `id` |
| A magic item in use | The bonus fields or `powers`; `equipped: true`; and if it needs attunement, `requiresAttunement: true`, `attuned: true` |
| A magic item that is **only passive** (Cloak of Elvenkind, Ring of Swimming) | One `passive` power holding the rule: without a power the item is on the Gear tab only and nothing on Play reminds the player of it. Keep the item's `description` to what the thing is ("Wondrous item, requires attunement"); do not write the rule twice. An item with no effect at the table (a trinket) needs only `description`. |
| A magic item that needs attunement and is **not attuned yet** | `requiresAttunement: true`, `attuned: false`, and `equipped` as it really is (worn or in the pack). Either way it does nothing and is not on Play until the player taps Attuned on the Gear tab, which also equips it. |
| An item that **sets or raises an ability score** (Amulet of Health, Gauntlets of Ogre Power, a Belt of Giant Strength, an Ioun Stone) | `abilityScores` on the item, and the hero's **own** score in `abilities` (the score without the item: 16, not 19). The app applies the item while it is active and takes it off when it is not. The Hit Point maximum is still the number you write: with an item that changes Constitution, write the maximum **with** the item if it is active, and say in the item's `description` what it is without it. |
| A consumable thrown or used up (Alchemist's Fire, Holy Water, caltrops) | `activation`, `quantity`, **no** `charges`. The card has − and + for the quantity. Never put a bare `activation` on a reusable item (Boots of Speed): using its card would lower `quantity`. A reusable ability goes in `powers`, even if it is the only one. |
| A potion or a scroll | The right name and a `quantity`. See [Names the app reads](#names-the-app-reads). |

### containers

`inventory.containers` is the list of places items are kept; every item names one with `containerId`. A new file
needs exactly one, `{ "id": "backpack", "name": "Backpack", "icon": "🎒" }`, and `"containerId": "backpack"` on every
item (worn items too). Add another only if the player has one that matters: a Bag of Holding, a mount, a chest at home.

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `id`, `name` | text | always | | |
| `icon`, `color` | text | optional | absent | A symbol (emoji) and a CSS colour. |
| `capacity` | number | optional | absent | Weight limit in pounds. Going over is a warning, not a block. |
| `weightless` | true/false | if it applies | absent | What is inside does not count toward the carried weight (Bag of Holding, a mount). |
| `extradimensional` | true/false | if it applies | absent | Bag of Holding, Handy Haversack, Portable Hole: one inside another is flagged. |
| `itemId` | text | if it applies | absent | The item this container *is* (the Bag of Holding item). The container is then wherever that item is. |

`inventory.categories` is the player's own item categories, each `{ id, name, icon, color }`. Write `[]`.

### item powers

`powers` is a list on an item. Each active power is its own card, in the hand of its activation, labelled with the
item's name. A passive power is a chip. An item with at least one active power has no card of its own.

| Field | Type | Write | Default | What it does |
|---|---|---|---|---|
| `id` | text | always | generated | |
| `name` | text | always | "Unnamed power" | |
| `activation` | as for features | always | `action` | Note the default is not `passive` here. |
| `cost` | number or `"all"` | if it applies | absent = free | Charges taken from the item's `charges` per use. `"all"` = every charge left (at least 1). Needs `charges` on the item. |
| `uses` | [counter](#counters) | if it applies | absent | The power's own counter, separate from the charges ("once per Long Rest"). |
| `description` | text | always | "" | |
| `tags` | list of text | optional | absent | |

- **A spell cast from an item** (a mace that casts Daylight for 1 charge) is a power: `activation` from the spell's
  casting time, `cost`, and the **spell's full text in the power's `description`**, with the DC if the item fixes one.
  Do not add it to `spells`: that would be a card that spends the hero's slots.
- A bonus to the spell save DC or to spell attacks is **not** a power: use `spellDcBonus` and `spellAttackBonus`.

### money

`inventory.money`: `{ "cp": 0, "sp": 14, "ep": 0, "gp": 43, "pp": 0 }`. All five of `cp` `sp` `ep` `gp` `pp`, each a
number ≥ 0. The app shows only gold until the player chooses other coins in the Money panel; coins it does not show keep
their amounts and are named in one line under it. Write the amounts as the sheet has them; do not convert them to gold.

### roleplay

All text, default "": `appearance`, `personality`, `ideals`, `bonds`, `flaws`, `voice`, `mannerisms`, `goals`,
`backstory`, `allies`, `notes`. Write all eleven keys, with `""` for what the player did not give. `notes` is the home
for anything that fits no other field, and for your list of open points.

These texts are drawn on the Story tab with the same formatting as a `description` (see [Text fields](#text-fields)):
paragraphs, `**bold**`, `_italic_`, bullet lists and tables; a single `\n` is a line break. So the open points in
`notes` can be a `**heading**` and a `- ` list, with a blank line (`\n\n`) before and after the list.

### Tags

`tags` on spells, features, items and item powers are short lowercase labels the Play screen filters by. The app
adds some itself, from the text, every time it shows a card. **Do not write those**:

| Automatic tag | Added when the description has |
|---|---|
| `damage` and the type (`fire`, `radiant`...) | dice followed by a damage type ("8d6 Fire"), or a type followed by "damage" ("Fire damage"). The types: fire, cold, lightning, thunder, acid, poison, necrotic, radiant, psychic, force, bludgeoning, piercing, slashing. |
| `healing` | "regain(s)" or "restore(s)" with "Hit Points" soon after; "Temporary Hit Points"; or the word heal, heals, healed, healing (not after "can't" or "cannot") |
| `control` | a saving throw ("Wisdom saving throw", "Dex save", "DC 15") **and** the name of a condition, anywhere in the same text |
| `concentration`, `ritual` | the spell's flags |
| `utility` | nothing else gave it a category |

Write a tag only for what the text cannot give: the four categories the app never detects (`buff`, `defense`,
`mobility`, `summon`); `control`, `damage` or `healing` on a card whose text misses the words above (Command, Revivify);
and the player's own labels (`"bow"`, `"social"`). Automatic tags cannot be removed and are sometimes over-eager;
that is harmless, do not bend the rules text to avoid it.

## 7. Traps and patterns

### Names the app reads

Potions and scrolls have no special fields. The app recognizes them **by the item's name**, when the item has no
`charges`:

| The name contains | The item becomes |
|---|---|
| "scroll" (but not "scroll case", "scroll tube", "scroll holder") | A spell scroll: a card that looks like the spell it holds |
| "potion", "elixir" or "philter" | A potion: a card with a Use button |
| one of those **and** "healing" | A healing potion: a counter beside Concentration, not a card. "Greater", "Superior" or "Supreme" in the name picks the kind; the dice come from the description, else the standard ones. |

A thing that merely has such a word in its name ("Potion Belt") is taken for one too: name it differently.
The Bulgarian words "свитък" and "отвара" (with "лекуване" or "лечебна" for healing) are read the same way, so a
homebrew potion or scroll with a Bulgarian name is recognized as it stands. In any other language, add the English
word to the name: "Zaubertrank der Eile (Potion)".

**Scrolls.** The spell is taken from the name: `Spell Scroll (Fireball)`, `Scroll of Fireball`, `Scroll: Fireball`,
`Fireball Scroll`. The card shows that spell's level, casting time and text, taken from the hero's own spell of that
name, else from the app's SRD spell list. The card also shows the scroll's own save DC and attack bonus ("DC 15 · +7
to hit"), worked out from the spell's level by this table (it does **not** use the hero's own DC for a scroll):

| Scroll's spell level | Cantrip, 1, 2 | 3, 4 | 5, 6 | 7, 8 | 9 |
|---|---|---|---|---|---|
| Save DC / attack bonus | 13 / +5 | 15 / +7 | 17 / +9 | 18 / +10 | 19 / +11 |

So for a spell the hero has or the SRD has, the scroll's `description` is only a short note, shown under the spell
text, and may be empty. Write `saveDc` and `spellAttack` on the item only when the scroll's numbers differ from the
table (a scroll the GM made stronger). For a spell that is neither the hero's nor in the SRD the app does not know the
level: the `description` is all the card has, so put the full spell text there, write `saveDc` and `spellAttack` from
the table yourself, and give the item an `activation` if the spell is not cast as an action.

### Fields and words the app does not know

**Words.** A value the importer does not recognize falls back to a default and is reported. Use the exact values
of section 6: ability ids, camelCase skill ids, lowercase class ids (a spell's `source` must match one exactly),
lowercase conditions, and the lists for `activation`, `recharge` and `source.type`.

**Fields.** A field the app does not use is kept untouched and listed in the import dialog as "not a field this app uses"; the
information is shown nowhere. So do not invent fields (`"rarity"`, `"resistances"`,
`"notes"` on an item, `"hp"` at the top level), and mind the spelling (`"descripton"` leaves the real field empty).
Put the information in a `description`, a feature, or `roleplay.notes`.

### Numbers out of range

Clamped, with an adjustment: ability scores 1–30, class level 1–20, spell level 0–9, Exhaustion 0–6, death saves
0–3, `hp.current` between 0 and `hp.max`. What is spent is brought down to what there is, also with an adjustment:
`used` of any counter above its `max`, `slotsUsed` above the hero's slots of that level, `pactSlotsUsed` above the
Pact Magic slots, `hitDiceUsed` above the dice of that size. Count the hero's slots before you write what is spent.

### Strict JSON

A syntax error rejects the whole file. No comments, no trailing commas. Straight double quotes only. Inside a text:
`\"`, `\n`, `\\`; no raw line breaks. `true`, `false`, `null` and numbers unquoted. One object at the top; one hero
per file.

### Pattern: a full caster with Channel Divinity and domain spells

A Life Domain Cleric of level 6, only the parts that are easy to get wrong (texts shortened here with "..."; write
them in full). The pool card is `special` with the counter; an option is its own card with no counter of its own,
linked to the pool by `poolId` and `cost`, so its card shows the pool's counter and spends from it (Divine Spark
and Preserve Life look like Turn Undead); Sear Undead lives inside Turn Undead; a domain spell is `prepared` and
`alwaysPrepared`. There is no "Life Domain Spells" feature and no "Sear Undead" feature.

<!-- FRAGMENT:START (tests/aiGuide.test.ts imports this fragment) -->
```json
{
  "classes": [{ "id": "cleric", "name": "Cleric", "level": 6, "subclass": "Life Domain" }],
  "features": [
    {
      "id": "feat-channel-divinity",
      "name": "Channel Divinity",
      "source": { "type": "class", "name": "Cleric 2" },
      "activation": "special",
      "description": "You can channel divine energy to fuel Divine Spark, Turn Undead and Preserve Life; each use of one of them expends one use here. You regain one use on a Short Rest and all on a Long Rest...",
      "uses": { "max": "cleric.channel-divinity", "used": 1, "recharge": "long", "shortRestRegain": 1 }
    },
    {
      "id": "feat-turn-undead",
      "name": "Channel Divinity: Turn Undead",
      "source": { "type": "class", "name": "Cleric 2" },
      "activation": "action",
      "description": "As a Magic action, each Undead of your choice within 30 feet must make a Wisdom saving throw or be Frightened and Incapacitated for 1 minute...\n\n_Sear Undead (Cleric 5)._ Each Undead that fails also takes Radiant damage equal to a number of d8s equal to your Wisdom modifier.",
      "poolId": "feat-channel-divinity",
      "cost": 1
    }
  ],
  "spells": [
    {
      "id": "spell-bless",
      "name": "Bless",
      "level": 1,
      "source": "cleric",
      "prepared": true,
      "alwaysPrepared": true,
      "ritual": false,
      "concentration": true,
      "school": "Enchantment",
      "castingTime": "Action",
      "range": "30 feet",
      "components": "V, S, M (a Holy Symbol worth 5+ GP)",
      "duration": "up to 1 minute",
      "description": "You bless up to three creatures within range. Whenever a target makes an attack roll or a saving throw before the spell ends, the target adds 1d4 to it...",
      "tags": ["buff"]
    }
  ]
}
```
<!-- FRAGMENT:END -->

## 8. Output and import

**The file.** One JSON object, UTF-8, nothing but the JSON. Name it after the hero in lowercase Latin letters and
digits with dashes, ending in `.json`: `vessa-thornhide.json`; transliterate a name in another alphabet (Борин
Каменобрад: `borin-kamenobrad.json`). The app accepts any name ending in `.json`. If you can attach or create a file,
do. If you can only write text, put the whole JSON in one code block and tell the player to save it as a plain-text
file with that name. Your notes to the player go in the chat.

**Importing**, in words you can pass on:

1. Open <https://itram05.github.io/DnD-Character-Manager/>.
2. On the first screen (the list of heroes), press **Import JSON** and choose the file.
3. A dialog shows the hero's name, class and level, and either "The file is clean. No adjustments needed." or a list
   of adjustments. Press **Import**.
4. If a hero with the same `id` is already there, the buttons are **Replace existing** and **Import as a copy**.

The goal is a clean import. If the dialog lists adjustments, ask the player to copy them to you: each names the field
and what was changed.

If the app refuses the file with "This file uses schema version 3, but this app only knows version 2. Update the
app: open it while online, press Reload on the "New version ready" row (or close the app and open it again), then
import the file again.", the file is fine: the player's copy of the app is older than this guide. They do what the
message says; nothing in the file changes.

Heroes live in **that browser on that device** only; **Export JSON**, next to the hero in the list, moves one or
backs it up. Tell the player.

## 9. Before you hand over the file

- [ ] `"schemaVersion": 3`, and the hero has an `id`. Strict JSON. Only fields from section 6.
- [ ] Final ability scores, Speed and Hit Point maximum are written; the Hit Point maximum is the player's number,
      or your calculation, and you told them if the two differ. Nothing derived is in the file.
- [ ] Every feature and every spell has its full text. Content from outside the SRD is written out, not referenced.
- [ ] Nothing in the file is a choice you made for the player. Open choices are listed, and in `roleplay.notes`.
- [ ] Every `activation` is deliberate; every `castingTime` starts with Action, Bonus Action or Reaction, or is a
      longer time on purpose.
- [ ] Each limited resource has exactly one counter, with `used` showing the current state. Options of a pool have none of their own: they name the pool (`poolId`, `cost`).
- [ ] Every weapon in use is `equipped`, has an attack, and the attack has `itemId`.
- [ ] Every magic item in use is active (equipped, and attuned if it needs it); at most three are attuned.
- [ ] Potions and scrolls are named so the app recognizes them; nothing else is named that way by accident.
- [ ] No reusable item ability sits on a bare `activation`; it is in `powers`.
- [ ] The numbers the app will calculate match the player's sheet.
- [ ] The player has the list of what is open, the numbers to expect, and the import steps.

## 10. A complete example

Vessa Thornhide, an Orc Ranger (Hunter) of level 5, 2024 rules, in the middle of an adventuring day. The file
imports with no adjustments and is written the way the app itself exports: every field present, in the app's order.
Use it as the template for your own files. The spell texts are from the SRD 5.2.1.

Things to notice:

- **Numbers the app works out** from this file: Armor Class 17 (Studded Leather 12 + Dexterity 4 + Cloak of
  Protection 1), Initiative +7 (Dexterity 4 + `initiativeBonus` 3 for Alert), spell save DC 13, spell slots 4 and 2,
  Emberwood Longbow +10 to hit for 1d8+5, Shortsword +7 for 1d6+4. None of them is in the file.
- **Favored Enemy** is passive with no counter; the free casts are `freeCasts` on Hunter's Mark, with the formula
  `"ranger.favored-enemy"`.
- **Adrenaline Rush** uses `"pb"` and comes back on a Short Rest; **Relentless Endurance** is a trigger, so `special`.
- **Emberwood Longbow** is homebrew, so everything about it is written out: a pool of 3 charges that regain by a
  roll (`regain`), two powers that spend charges (`cost`), one power with its own counter (`uses`), and a passive
  power. Its +1 and the Archery +2 are in the attack's `bonus`. The attack points at it with `itemId`.
- **Cloak of Protection** gives `acBonus` and `saveBonus`, and counts because it is equipped and attuned.
- **Potion of Healing** and **Spell Scroll (Fog Cloud)** are recognized by name. **Alchemist's Fire** is a
  quantity-spent consumable: `activation`, no `charges`.
- One container, **Backpack**; every item, worn or not, has `"containerId": "backpack"`.
- **Goodberry** has `prepared: false`: on the Spells tab, not on Play.
- The state is mid-session: 31 of 44 Hit Points, one slot of each level spent, one Hit Point Die spent, one charge
  gone, concentrating on Hunter's Mark.

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
        ],
        "containerId": "backpack"
      },
      {
        "id": "item-shortsword",
        "name": "Shortsword",
        "quantity": 1,
        "equipped": true,
        "requiresAttunement": false,
        "attuned": false,
        "description": "Martial melee weapon. Finesse, Light. Mastery: Vex.",
        "weight": 2,
        "containerId": "backpack"
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
        },
        "containerId": "backpack"
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
        "saveBonus": 1,
        "containerId": "backpack"
      },
      {
        "id": "item-potion-of-healing",
        "name": "Potion of Healing",
        "quantity": 2,
        "equipped": false,
        "requiresAttunement": false,
        "attuned": false,
        "description": "You regain 2d4 + 2 Hit Points when you drink this potion. Drinking it or giving it to another creature takes a Bonus Action.",
        "weight": 0.5,
        "containerId": "backpack"
      },
      {
        "id": "item-spell-scroll-fog-cloud",
        "name": "Spell Scroll (Fog Cloud)",
        "quantity": 1,
        "equipped": false,
        "requiresAttunement": false,
        "attuned": false,
        "description": "Level 1 spell scroll. Spell save DC 13, attack bonus +5.",
        "containerId": "backpack"
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
        "activation": "action",
        "containerId": "backpack"
      },
      {
        "id": "item-arrows",
        "name": "Arrows",
        "quantity": 37,
        "equipped": false,
        "requiresAttunement": false,
        "attuned": false,
        "description": "",
        "weight": 0.05,
        "containerId": "backpack"
      },
      {
        "id": "item-thieves-tools",
        "name": "Thieves' Tools",
        "quantity": 1,
        "equipped": false,
        "requiresAttunement": false,
        "attuned": false,
        "description": "",
        "weight": 1,
        "containerId": "backpack"
      },
      {
        "id": "item-explorer-s-pack",
        "name": "Explorer's Pack",
        "quantity": 1,
        "equipped": false,
        "requiresAttunement": false,
        "attuned": false,
        "description": "Backpack, bedroll, 2 flasks of oil, 10 days of rations, rope, tinderbox, 10 torches, waterskin.",
        "weight": 55,
        "containerId": "backpack"
      }
    ],
    "money": {
      "cp": 0,
      "sp": 14,
      "ep": 0,
      "gp": 43,
      "pp": 0
    },
    "containers": [
      {
        "id": "backpack",
        "name": "Backpack",
        "icon": "🎒"
      }
    ],
    "categories": []
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
  "recipes": [],
  "playCounters": [],
  "preferences": {
    "gear": {
      "view": "hybrid",
      "groupBy": "container",
      "show": {
        "quantity": true,
        "weight": true,
        "category": true,
        "tags": true,
        "charges": true
      }
    }
  },
  "updatedAt": "2026-10-03T12:00:00.000Z"
}
```
<!-- EXAMPLE:END -->

## 11. The 2014 rules

Only if the player says their table plays the 2014 rules. The app is built on the 2024 rules; the same file format
works, with these differences:

| What | What to do in the file |
|---|---|
| Exhaustion | Add `"exhaustionRules": "2014"` at the top level: the app then applies the 2014 table instead of −2 per level. This is the only edition switch the app has. |
| Spell slots | They differ from 2024 in two cases: a Paladin or Ranger of level 1 (2014: no slots), and a multiclass hero with Paladin or Ranger levels (2014 rounds half of those levels **down**, the app rounds **up**). In those cases write the 2014 slots in `spellcasting.slotsOverride`, for example `[4, 2]`, or `[0]` for none, and tell the player it must be changed by hand on a level-up. |
| Counters of class features | A plain number, or a formula with `pb`, `level` and ability modifiers. Not class-table formulas such as `"cleric.channel-divinity"`: those tables hold the 2024 numbers. |
| Texts | Write the 2014 text of every feature and spell. Still write `castingTime` as "Action", not "1 action". |
| Weapon Mastery | Does not exist: leave `weaponMasteries` empty and `mastery` blank. |
| Race, Inspiration | `species` and `heroicInspiration`. |
| Jack of All Trades | The app adds it to skills only. In 2014 it also applies to Initiative: add it to `combat.initiativeBonus`. |

Tell the player what the app still does the 2024 way: a Long Rest gives back **all** Hit Point Dice, the Level Up tab
suggests 2024 features, and the limits on the Spells tab are the 2024 ones. None of that damages the file.

## 12. Journal, XP log, timers, recipes, preferences, images

What the app writes itself. A new file has `[]` for the five lists, the `preferences` shown below, and no `images`.
When you edit an exported file, keep all of it as it is.

### sessionNotes

The player's journal: a list of `{ id, date, title, text }`. `date` is text, by convention `"2026-09-27"`.

### xpLog

Written by the app's XP panel, one entry per change of `xp`: `{ id, date, kind, amount }` plus, for a session,
`groupXp` and `players`. `kind` is `"session"` or `"correction"`; `amount` is what was added to `xp`.

### timers

Countdowns in days: `{ "id": "timer-rent", "name": "Rent due", "days": 9, "start": 14, "note": "5 GP" }`. `days` is
how many are left (0 = ended), `start` what the timer was set to (default: `days`), `note` optional. A Long Rest
takes one day off each.

### recipes

The player's crafting recipes, made on the Gear tab; none are built in. Each is `{ id, name, inputs, output, time, tool,
dc, note, containerId }`: `inputs` is a list of `{ name, quantity }`, `output` is `{ name, quantity, template }`
(`template`: item fields for a new item), the rest is free text. Recipes name items **by name**, not by id.
`playCounters` is a list of `{ name }`: items shown as counters on Play. Write a recipe only if the player asks for one.

### preferences

`{ "gear": { "view": "hybrid", "groupBy": "container", "show": { "quantity": true, "weight": true, "category": true, "tags": true, "charges": true } } }`.
`view`: `hybrid`, `tiles` or `rows`. `groupBy`: `container`, `category` or `none`. These are the defaults; write them as they are.

The player's own display choices may sit next to `gear` in an exported file. **Do not write them in a new file** (absent means
the app's default) and **keep them unchanged** when you edit an exported one:

- `money`: `{ "coins": ["gp"] }`. `coins` lists the coins the Money panel shows, any of `pp` `gp` `ep` `sp` `cp`. Absent = gold
  only. It only hides rows: every amount stays in `inventory.money`, and you still write all five there.
- `play`: `{ "attackOrder": "name", "phoneStart": "action", "editButtons": false }`, each field on its own.
  `attackOrder`: `file` (default: the attack cards follow the order of `attacks`, so **write the hero's main attack
  first**) or `name` (A to Z). `phoneStart`: what a phone opens the Play screen with: `all` (default, every hand) or one
  hand, `action`, `bonus`, `reaction`, `other`. `editButtons`: `false` hides the small Edit button of each Play section.

### images

Maps and pictures the player added on the Images tab. An exported file carries each as `{ id, name, width, height,
bytes, thumb, data }`, where `thumb` and `data` are the picture itself as very long `data:image/...;base64,` texts.

- **You never write images**, and a new file has no `images` field at all.
- **Editing an exported file: copy every entry character for character.** A shortened or re-typed `data` is a
  destroyed picture. An `images` field that is present replaces the hero's pictures, even when it is `[]`.
- If the file is too large for you to return whole, do not cut it. Ask the player for **Export without images** (on
  the Images tab) instead: that file has no `images` field, and importing it with **Replace existing** keeps the
  pictures already in the browser.

## 13. Changing a hero later

When the player comes back to add an item, fix a feature or level up through you:

1. They press **Export JSON** in the app and give you that file with this guide. Work from the fresh export, never
   from the file you wrote earlier: the app has since changed Hit Points, slots, charges and notes.
2. Change only what was asked. Keep everything else exactly as it is: every `id` (above all the hero's own), every
   counter's `used`, everything in section 12 (above all `images`), and any field you do not recognize. A field that is not in this guide
   was most likely written by a newer version of the app; removing it loses the player's data.
3. If the export's `schemaVersion` is higher than 3, this guide is out of date. Say so and ask for the current guide.
   Never lower the number.
4. On a level-up, go through what the app does not calculate (section 4): Hit Point maximum, new features and spells,
   a higher `initiativeBonus` if it depends on the Proficiency Bonus, a `slotsOverride` if there is one.
5. Return the whole file, not a fragment. The player imports it and chooses **Replace existing**.

For small changes the app's own editor is quicker than a round trip through a file. Say so when it applies.

---

This guide includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC,
available at <https://www.dndbeyond.com/srd>. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0
International License, available at <https://creativecommons.org/licenses/by/4.0/legalcode>.
Compatible with fifth edition. Not affiliated with or endorsed by Wizards of the Coast.

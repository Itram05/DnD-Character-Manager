# Character file format (schemaVersion 1)

A character is one JSON object. The app exports it with **Export JSON** and reads it with **Import JSON**.
A full example: [`examples/sample-character.json`](examples/sample-character.json) (Paladin 3 / Sorcerer 3 / Warlock 1).

## Rules for hand-written files

- **Almost everything is optional.** A missing field gets a sensible default. `{}` is a valid (empty) character.
- **The importer forgives.** Numbers written as text (`"16"`) are converted, `"Bonus Action"` is read as `"bonus"`,
  `"Long Rest"` as `"long"`, `"Strength"` as `"str"`, a skill list `["Perception"]` means proficient, etc.
  Every change it makes is listed in the import dialog. Nothing it cannot understand crashes the app; it is skipped with a warning.
- **Fatal errors** (the file is rejected with a message): not valid JSON, not an object, or `schemaVersion` newer than the app.
- `id` fields are generated if missing. Keep them if you re-import the same character (the app then offers to replace it).
- Everything that is **not in the SRD** (PHB subclasses, feats, items, homebrew) is described completely in the character file.

## Formulas

Some numbers can be a **formula** (marked *formula* below): a number, or text such as `"max(1, cha)"`.

| Part | Meaning |
|---|---|
| `str dex con int wis cha` | ability **modifier** |
| `str_score` ... `cha_score` | ability **score** |
| `pb` | proficiency bonus |
| `level` | total character level |
| `paladin`, `wizard`, ... | level in that class (0 if you don't have it) |
| `barbarian.rages`, `monk.focus-points`, `cleric.channel-divinity`, ... | a column of the SRD class table at your class level |
| `+ - * /`, `( )`, `min()`, `max()`, `floor()`, `ceil()` | arithmetic |

Examples: Bardic Inspiration `"max(1, cha)"`, Lay On Hands `"paladin * 5"`, Rage `"barbarian.rages"`,
Breath Weapon `"pb"`, Barbarian AC `"10 + dex + con"`.

Class table column names = the table header in lowercase with dashes: `rages`, `rage-damage`, `weapon-mastery`,
`bardic-die`, `cantrips`, `prepared-spells`, `channel-divinity`, `wild-shape`, `second-wind`, `martial-arts`,
`focus-points`, `unarmored-movement`, `favored-enemy`, `sneak-attack`, `sorcery-points`, `eldritch-invocations`,
`spell-slots`, `slot-level`. Only the first number of a cell is used (`"+10 ft."` → 10).

## Top level

| Field | Type | Default | Notes |
|---|---|---|---|
| `schemaVersion` | number | 1 | Bump only through the app. |
| `id` | text | generated | |
| `name` | text | "Unnamed hero" | |
| `player` | text | "" | |
| `species` | `{ name, size }` or text | `{ "", "Medium" }` | `race` is accepted as an alias. |
| `background` | text | "" | |
| `alignment` | text | "" | |
| `xp` | number | 0 | |
| `classes` | list of [class](#classes) | Fighter 1 | **The first class is the starting class** (it gives saving throw proficiencies). |
| `abilities` | `{ str, dex, con, int, wis, cha }` | all 10 | Scores 1–30. Long names (`strength`) also work. |
| `proficiencies` | [object](#proficiencies) | | |
| `combat` | [object](#combat) | | |
| `conditions` | list of text | [] | Ids: `blinded charmed deafened frightened grappled incapacitated invisible paralyzed petrified poisoned prone restrained stunned unconscious`. |
| `exhaustion` | 0–6 | 0 | 2024 rules: −2 per level to d20 tests, −5 ft Speed per level. |
| `heroicInspiration` | true/false | false | |
| `features` | list of [feature](#features) | [] | |
| `attacks` | list of [attack](#attacks) | [] | |
| `spellcasting` | [object](#spellcasting) | | Slot usage and concentration. |
| `spells` | list of [spell](#spells) | [] | |
| `inventory` | `{ items, money }` | | See [items](#items). `money = { cp, sp, ep, gp, pp }`. |
| `roleplay` | [object](#roleplay) | all "" | |
| `sessionNotes` | list of `{ date, title, text }` | [] | |
| `updatedAt` | ISO date | now | Set by the app. |

## classes

```json
{ "id": "fighter", "level": 5, "subclass": "Eldritch Knight", "casterType": "third", "spellcastingAbility": "int" }
```

| Field | Notes |
|---|---|
| `id` | SRD class id (`barbarian bard cleric druid fighter monk paladin ranger rogue sorcerer warlock wizard`) or any id for a non-SRD class. A plain string `"wizard"` means level 1. |
| `name` | Defaults to the SRD name. |
| `level` | 1–20. |
| `subclass` | Any text. SRD subclasses (one per class) are recognized and used by Level Up. |
| `hitDie` | Only for non-SRD classes: `8` or `"d8"`. |
| `casterType` | `full`, `half`, `third`, `pact`, `none`. Needed for non-SRD casters and spell-casting subclasses of non-casters (Eldritch Knight, Arcane Trickster = `third`). |
| `spellcastingAbility` | Needed together with `casterType` when the class is not an SRD caster. |

Spell slots are **computed**: one caster class uses its own table; several use the 2024 multiclass rule
(full levels + half of Paladin/Ranger levels rounded up + a third of `third` levels rounded down). Warlock Pact Magic is separate.

## proficiencies

| Field | Notes |
|---|---|
| `savingThrows` | e.g. `["wis", "cha"]`. Leave empty to use the first class's saves. |
| `skills` | `{ "perception": "proficient", "stealth": "expertise" }` or a list `["perception"]`. Ids: `acrobatics animalHandling arcana athletics deception history insight intimidation investigation medicine nature perception performance persuasion religion sleightOfHand stealth survival` ("Sleight of Hand" also works). |
| `jackOfAllTrades` | true adds half PB to skill checks without proficiency. |
| `armor`, `weapons`, `tools`, `languages` | Free text. |
| `weaponMasteries` | List of text, e.g. `["Longsword (Sap)"]`. |

## combat

| Field | Notes |
|---|---|
| `hp` | `{ max, current, temp }`. `current` defaults to `max`. |
| `unarmoredAc` | *formula*, used when no body armor is equipped. Default `"10 + dex"`. |
| `acBonus` | Extra AC from anything not in the inventory (Fighting Style: Defense...). |
| `initiativeBonus` | Extra initiative (Alert feat: put your PB here). |
| `speed` | Base walking speed; exhaustion is applied automatically. |
| `hitDiceUsed` | `{ "d10": 1 }`: spent Hit Point Dice by die size. The pool is computed from the classes. |
| `deathSaves` | `{ successes, failures }`. |

AC is **computed**: equipped item with `armor` → its base + Dex (limited by `dexCap`), otherwise `unarmoredAc`;
then + every equipped item's `acBonus` (items that require attunement count only when attuned) + `acBonus`.

## features

```json
{
  "name": "Second Wind",
  "source": { "type": "class", "name": "Fighter 1" },
  "activation": "bonus",
  "uses": { "max": "fighter.second-wind", "used": 0, "recharge": "long", "shortRestRegain": 1 },
  "description": "Regain 1d10 + Fighter level HP."
}
```

| Field | Notes |
|---|---|
| `name` | |
| `source.type` | `class`, `subclass`, `species`, `background`, `feat`, `item`, `other` — decides the card frame color. `race` → `species`. A plain string also works. |
| `source.name` | Free text shown on the card ("Paladin 3"). |
| `activation` | `passive` (always on, no card), `action`, `bonus`, `reaction`, `free` (no action), `special`. Decides which hand the card is in. |
| `uses` | Optional [uses](#uses). |
| `description` | Text. `**bold**`, `_italic_`, lines starting with `• ` and `| table | rows |` are rendered. |
| `level` | Optional, informational. |

## uses

Used by features (`uses`), spells (`freeCasts`) and items (`charges`).

| Field | Notes |
|---|---|
| `max` | *formula*. |
| `used` | How many are spent now. |
| `recharge` | `short` (Short **or** Long Rest), `long`, `dawn`, `other` (manual), `none`. |
| `shortRestRegain` | *formula*; for `long` recharge: this many come back on a Short Rest (Rage, Channel Divinity, Wild Shape, Second Wind: `1`). |
| `regain` | Text such as `"1d6+1"`: comes back with a roll, so rests **remind** you instead of refilling. |
| `note` | Label next to the counter ("HP pool", "Sorcery Points"). |
| `resource` | Optional marker for a known class resource. Only `"sorcery-points"` for now: the counter is shown next to the spell slots with Flexible Casting buttons instead of as a card. Without the marker, a counter still counts as Sorcery Points when its `note` says "Sorcery Points" or its `max` is `sorcerer` / `sorcerer.sorcery-points`. |

## attacks

```json
{ "name": "Longsword", "ability": "str", "proficient": true, "bonus": 1, "damage": "1d8", "damageType": "Slashing", "damageBonus": 0, "addAbilityToDamage": true, "mastery": "Sap", "notes": "" }
```

`ability`: an ability, `finesse` (best of Str/Dex) or `spell` (the first spellcasting class's ability).
To-hit and damage bonus are computed. Attacks appear as cards in the Action hand.

## spellcasting

| Field | Notes |
|---|---|
| `slotsUsed` | Nine numbers, index 0 = level 1 slots used. |
| `pactSlotsUsed` | Pact Magic slots used. |
| `concentration` | Name of the spell you concentrate on, or "". |
| `slotsOverride` | Optional: replaces the computed slots, e.g. `[4, 3, 2]`. |
| `pactOverride` | Optional: `{ "slots": 2, "level": 3 }`. |
| `bonusSlots` | Optional, written by the app: slots created with Sorcery Points (Flexible Casting), nine numbers like `slotsUsed`. They add to the maximum and are removed on a Long Rest. |

## spells

```json
{ "name": "Shield", "level": 1, "source": "sorcerer", "prepared": true, "castingTime": "Reaction, when hit", "range": "Self", "components": "V, S", "duration": "1 round", "description": "+5 AC." }
```

| Field | Notes |
|---|---|
| `name`, `level` | `level` 0 = cantrip. A plain string `"Fire Bolt"` works (then fill it in the app: typing an SRD name fills everything). |
| `source` | Class id (decides the spellcasting ability shown) or `feat`, `item`, ... |
| `prepared` | Default true. Unprepared spells are not shown as cards. |
| `alwaysPrepared` | Subclass/feat spells; they don't count toward the prepared limit. |
| `ritual`, `concentration` | true/false. |
| `school`, `castingTime`, `range`, `components`, `duration`, `description` | Text. `castingTime` starting with "Bonus Action" / "Reaction" puts the card in that hand. |
| `freeCasts` | [uses](#uses) for casting without a slot (Magic Initiate, Divine Smite from Paladin's Smite, Mystic Arcanum...). |

## items

```json
{ "name": "Wand of Magic Missiles", "quantity": 1, "equipped": false, "activation": "action",
  "charges": { "max": 7, "used": 0, "recharge": "dawn", "regain": "1d6+1" }, "description": "..." }
```

| Field | Notes |
|---|---|
| `name`, `quantity` (default 1), `weight`, `description` | |
| `equipped` | |
| `requiresAttunement`, `attuned` | At most 3 attuned items (extra ones are un-attuned on import). An item that requires attunement but is not attuned is hidden from the Play screen (with any feature whose `source` is `{ "type": "item", "name": <item name> }`); attune it on the Gear tab. Attuning there also sets `equipped`. |
| `armor` | `{ "base": 14, "dexCap": 2 }` — body armor. `dexCap`: `null` = full Dex (light), `2` (medium), `0` (heavy). |
| `acBonus` | Added to AC while equipped (and attuned if required). Shield = 2. |
| `saveBonus` | Added to all saving throws under the same condition (Ring/Cloak of Protection). |
| `charges` | [uses](#uses). |
| `activation` | Makes the item a card: `action`, `bonus`, ... Without `charges`, the card is a consumable: − and + on the card lower and raise `quantity`. Potions and scrolls are recognized by name instead (below) and need no `activation`. |

**Potions and scrolls** are ordinary items; the Play screen only reads their name (src/model/consumables.ts). An item **without `charges`** is a *scroll* if its name contains "scroll" (not "scroll case/tube"); the spell is taken from "Scroll of X", "Spell Scroll of X", "Spell Scroll (X)", "Scroll: X" or "X scroll", and its text from the character's spells, then the SRD, then the item's `description`. Otherwise it is a *potion* if its name contains "potion", "elixir" or "philter"; potions are counters at the top of the Play screen, not cards.

## roleplay

All text: `appearance`, `personality`, `ideals`, `bonds`, `flaws`, `voice`, `mannerisms`, `goals`, `backstory`, `allies`, `notes`.
Blank lines separate paragraphs.

## Versioning

`schemaVersion` is 1. When the format changes, the app will bump it and convert older files on import
(`src/model/normalize.ts`, "Future migrations go here"). Files from a newer app version are rejected with a clear message.

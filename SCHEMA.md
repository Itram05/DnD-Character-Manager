# Character file format (schemaVersion 3)

A character is one JSON object. The app exports it with **Export JSON** and reads it with **Import JSON**.
A full example: [`examples/sample-character.json`](examples/sample-character.json) (Paladin 3 / Sorcerer 3 / Warlock 1).

For a player's AI assistant that should write such a file there is [`AI-GUIDE.md`](AI-GUIDE.md): the same format, with the
behaviour of the app spelled out for a reader who cannot see it. A change to the format goes into both documents.

## Rules for hand-written files

- **Almost everything is optional.** A missing field gets a sensible default. `{}` is a valid (empty) character.
- **The importer forgives.** Numbers written as text (`"16"`) are converted, `"Bonus Action"` is read as `"bonus"`,
  `"Long Rest"` as `"long"`, `"Strength"` as `"str"`, a skill list `["Perception"]` means proficient, etc.
  Every change it makes is listed in the import dialog. Nothing it cannot understand crashes the app: a value of the wrong kind is skipped with a warning.
- **Unknown fields are kept.** A field the app does not use (`"summary"`, `"rarity"`, your own notes) stays where it is, unchanged, and is exported again. The import dialog lists it ("not a field this app uses; kept unchanged"), so a typo such as `"descripton"` is easy to spot. (Version 1 of the app dropped such fields silently; since version 2 nothing is dropped.)
- **Fatal errors** (the file is rejected with a message): not valid JSON, not an object, or `schemaVersion` newer than the app.
- An **older version** (1 or 2) is converted on import (see [Versioning](#versioning)); the app always exports the current version (3).
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
| `schemaVersion` | number | 1 | Bump only through the app. A file without it is read as version 1. The app writes 3. |
| `id` | text | generated | |
| `name` | text | "Unnamed hero" | |
| `player` | text | "" | |
| `species` | `{ name, size }` or text | `{ "", "Medium" }` | `race` is accepted as an alias. |
| `background` | text | "" | |
| `alignment` | text | "" | |
| `xp` | number | 0 | Total experience points. The Level Up tab adds session XP to it; see [experience](#experience). |
| `partySize` | 1–20 | 5 | How many players share the session XP. |
| `xpLog` | list of [XP entries](#experience) | [] | |
| `classes` | list of [class](#classes) | Fighter 1 | **The first class is the starting class** (it gives saving throw proficiencies). |
| `abilities` | `{ str, dex, con, int, wis, cha }` | all 10 | Scores 1–30. Long names (`strength`) also work. |
| `proficiencies` | [object](#proficiencies) | | |
| `combat` | [object](#combat) | | |
| `conditions` | list of text | [] | Ids: `blinded charmed deafened frightened grappled incapacitated invisible paralyzed petrified poisoned prone restrained stunned unconscious`. |
| `exhaustion` | 0–6 | 0 | Applied automatically, by `exhaustionRules`. |
| `exhaustionRules` | `"2014"` or `"2024"` | absent = `"2024"` | Optional. 2024: −2 per level to d20 tests, −5 ft Speed per level. 2014: 1 Disadvantage on ability checks; 2 Speed halved; 3 Disadvantage on attacks and saves; 4 HP maximum halved; 5 Speed 0. 6 is death in both. Only `"2014"` is written on export. |
| `heroicInspiration` | true/false | false | |
| `features` | list of [feature](#features) | [] | |
| `attacks` | list of [attack](#attacks) | [] | |
| `spellcasting` | [object](#spellcasting) | | Slot usage and concentration. |
| `spells` | list of [spell](#spells) | [] | |
| `inventory` | `{ items, money, containers, categories }` | | See [items](#items) and [containers](#containers). `money = { cp, sp, ep, gp, pp }`. |
| `roleplay` | [object](#roleplay) | all "" | |
| `sessionNotes` | list of `{ date, title, text }` | [] | |
| `timers` | list of [day timers](#timers) | [] | |
| `recipes` | list of [recipes](#recipes) | [] | Your crafting recipes. None are built in. |
| `playCounters` | list of `{ "name" }` | [] | Items shown as counters in Play, in this order. See [recipes](#recipes). |
| `preferences` | `{ gear, money?, play? }` | see [preferences](#preferences) | How the sheet looks for this character. |
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
| `tags` | Optional list of your own [tags](#tags). |
| `poolId` | Optional. The `id` of another feature whose `uses` this one spends (see below). |
| `cost` | Optional, with `poolId`: how many of the pool's uses one use takes. A whole number, 1 or more; absent = 1. Without `poolId` it is ignored with a warning. |

### A feature that spends another feature's uses

One counter with several options (Channel Divinity: Turn Undead, Preserve Life; Wild Shape; Monk's Focus) is one
feature with `uses` (the pool) and one feature per option that names it. The same idea as an item's
[powers](#item-powers) and its charges.

```json
{ "id": "cd", "name": "Channel Divinity", "activation": "special", "uses": { "max": "cleric.channel-divinity", "used": 0, "recharge": "long", "shortRestRegain": 1 } },
{ "id": "turn", "name": "Turn Undead", "activation": "action", "poolId": "cd", "cost": 1 }
```

- The option's card shows the pool's counter; "Use" spends `cost` from the pool, "Undo one use" gives it back. The
  card is tapped when the pool has less than `cost` left. The pool's own card keeps working as before.
- An option with `uses` of its own shows those and spends both (one of its own, `cost` from the pool).
- Rests restore the pool as they always did (`recharge`, `shortRestRegain`); the options have nothing to restore.
- The link is an **id** (like `itemId` on an attack), so renaming the pool keeps it. Deleting the pool in the app
  removes the link from its options.
- On import: a `poolId` that matches no feature id but is the name of exactly one other feature is linked by name
  (with a warning); one that matches nothing, or names the feature itself, is removed with a warning; a pool
  without `uses` keeps the link and warns that the card spends nothing until the pool gets a counter.

## uses

Used by features (`uses`), spells (`freeCasts`) and items (`charges`).

| Field | Notes |
|---|---|
| `max` | *formula*. |
| `used` | How many are spent now. Above `max` it is brought down to `max` on import, with a warning (since 2026-10-11); a `max` formula the app cannot work out is left alone. The same check covers `spellcasting.slotsUsed` (against the slots of that level, created ones included), `pactSlotsUsed` and `combat.hitDiceUsed` (per die size the hero has). |
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
A `spell` attack is a spell attack: it also takes the `spellAttackBonus` of the items that count (see items), so
do not repeat that bonus in `bonus`.
To-hit and damage bonus are computed. Attacks appear as cards in the Action hand.

`itemId` (optional): the `id` of the item the attack is made with. The attack then also shows in that item's panel
in the Items section of Play. It is an id, not a name, so renaming the item keeps the link. `null` = no item.
When the field is **missing**, the app links the attack on import to the item whose name the attack's name starts
with (`"Staff of Ages (+3)"` → the item `"Staff of Ages"`; whole words, the longest item name wins) and says so in
the import report; if no item matches, it writes `null`, so the guess is made only once. A link to an item that is
no longer in the inventory becomes `null`. Change the link in the attack's editor (Stats tab).
An attack linked to an item that is not on the Play screen (not equipped, or not attuned) is hidden from Play with it.

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
| `alwaysPrepared` | Subclass/feat spells; they don't count toward the prepared limit, and an always-prepared cantrip doesn't count toward the class's number of cantrips. |
| `ritual`, `concentration` | true/false. |
| `school`, `castingTime`, `range`, `components`, `duration`, `description` | Text. `castingTime` starting with "Bonus Action" / "Reaction" puts the card in that hand. |
| `castingAbility` | Optional ability id (`cha`): the ability this one spell is cast with when it is not the class's (a species' spell, Magic Initiate, Fey-Touched). The card and its window then show "DC 14 · +6 to hit": 8 + that modifier + PB, and the modifier + PB, with the items' `spellDcBonus` / `spellAttackBonus`; Exhaustion counts on the attack. Absent = nothing on the card. Since 2026-10-11. |
| `freeCasts` | [uses](#uses) for casting without a slot (Magic Initiate, Divine Smite from Paladin's Smite, Mystic Arcanum...). |
| `tags` | Optional list of your own [tags](#tags), e.g. `["buff", "revive"]`. |

## items

```json
{ "name": "Wand of Magic Missiles", "quantity": 1, "equipped": false, "activation": "action",
  "charges": { "max": 7, "used": 0, "recharge": "dawn", "regain": "1d6+1" }, "description": "..." }
```

| Field | Notes |
|---|---|
| `name`, `quantity` (default 1), `weight`, `description` | |
| `equipped` | Only equipped items are on the Play screen (their cards, tile, linked attacks, "Always on" chips and features from them), and only when attuned if they require attunement: the same rule as `acBonus` below. Exception: consumables are carried, not equipped, and need no `equipped`: potions, scrolls, and items without `charges` that have an `activation` and no active powers (spent by `quantity`). An unequipped item that has something for the table is tagged "Not equipped: hidden in Play" on the Gear tab. (Until 2026-09-29 only attunement mattered for the Play screen.) |
| `requiresAttunement`, `attuned` | At most 3 attuned items (extra ones are un-attuned on import). An item that requires attunement but is not attuned is hidden from the Play screen (with any feature whose `source` is `{ "type": "item", "name": <item name> }`, and any attack whose `itemId` is the item); attune it on the Gear tab. Attuning there also sets `equipped`. |
| `armor` | `{ "base": 14, "dexCap": 2 }` — body armor. `dexCap`: `null` = full Dex (light), `2` (medium), `0` (heavy). |
| `acBonus` | Added to AC while equipped (and attuned if required). Shield = 2. |
| `saveBonus` | Added to all saving throws under the same condition (Ring/Cloak of Protection). |
| `spellDcBonus` | Added to the spell save DC under the same condition (a focus with +1 to the DC). Shown as a chip "+1 spell save DC" under "Always on" exactly while it counts. |
| `spellAttackBonus` | Added to spell attack rolls under the same condition (Staff of Ages +3): the spell attack in the head and every attack with `"ability": "spell"`. Chip "+3 spell attack". |
| `abilityScores` | Optional list of `{ "ability": "con", "mode": "set", "value": 19 }` / `{ "ability": "con", "mode": "add", "value": 2, "max": 20 }`, applied under the same condition as `acBonus`. `abilities` stays the hero's own score; the score that counts (modifiers, saves, skills, AC, Initiative, attacks, spell DC, `con` and `str_score` in formulas, Hit Point Dice healing) is read through it. `add`: plus `value`, never above `max` (absent = 20; a score already above it is left alone; a negative `value` has no maximum). `set`: becomes `value` unless already higher; `max` is ignored with a warning. Bonuses are applied first, then the highest `set`. Chips "Constitution 19" / "+2 Constitution" under "Always on" while it counts; the Stats tab shows the score with "own 16" under it. **Not** recalculated: `combat.hp.max` (typed in), the Hit Points a level-up adds and multiclass prerequisites (both use the hero's own score). Since 2026-10-11; an older version 3 app keeps the field and ignores it. |
| `saveDc`, `spellAttack` | Spell scrolls only (an item the app recognizes as a scroll, below): the scroll's own save DC and spell attack bonus. Absent = the SRD's Spell Scroll table by the spell's level (cantrip to 2: 13 / +5; 3–4: 15 / +7; 5–6: 17 / +9; 7–8: 18 / +10; 9: 19 / +11). The card and its window show "DC 15 · +7 to hit"; Exhaustion counts on the attack as on attack cards. A scroll whose spell is found neither among the hero's spells nor in the SRD has no level, so it shows only what these fields set. Since 2026-10-11. |
| `charges` | [uses](#uses). |
| `activation` | Makes the item a card: `action`, `bonus`, ... Without `charges`, the card is a consumable: − and + on the card lower and raise `quantity`. Potions and scrolls are recognized by name instead (below) and need no `activation`. |
| `powers` | Optional list of [item powers](#item-powers): the item's separate abilities, each its own card. |
| `tags` | Optional list of your own [tags](#tags). They also apply to every power of the item. |
| `containerId` | The id of the [container](#containers) the item is in. Missing or unknown = the first container (an unknown one with a warning). Where the item is kept, not whether it is worn: an `equipped` item counts as on you whatever its container. |
| `category` | Optional category id: a built-in one (`weapon`, `armor`, `magic`, `scroll`, `potion`, `material`, `valuable`, `gear`) or one from `inventory.categories`. Without it the app guesses (scroll, potion, armor, weapon if an attack is made with it, magic, `material` tag, else gear); the guess is not written to the file. An id the list does not have is added to `inventory.categories` on import, with a warning. |

## containers

```json
"containers": [
  { "id": "backpack", "name": "Backpack", "icon": "🎒" },
  { "id": "k2", "name": "Bag of Holding", "itemId": "boh", "capacity": 500, "weightless": true, "extradimensional": true }
]
```

The inventory is one flat list of items; each item names its container. Containers are made by the player.

| Field | Notes |
|---|---|
| `id`, `name` | A duplicate id gets a new id on import (the items stay with the first). |
| `icon`, `color` | Optional: a short symbol (emoji) and a CSS colour. |
| `capacity` | Optional weight limit of what is inside, lb. Over it is a warning on the Gear tab, not a block. |
| `weightless` | What is inside does not count toward the carried weight (Bag of Holding, a mount, a chest at home). The bag item itself still counts where it is. |
| `extradimensional` | Bag of Holding, Handy Haversack, Portable Hole: one inside another (at any depth) is a warning, as in the rules. |
| `itemId` | The item this container is (the Bag of Holding item). The container is then wherever that item is: that is how containers nest. A link to a missing item, a second container claiming the same item, or a loop (a bag inside itself) is removed on import with a warning; the container and its items stay. |

**Weight.** Carried = every item that is `equipped`, or not inside a `weightless` container at any depth; weight × quantity, rounded to 1/1000 lb. A container's load (for `capacity`) = its unequipped items, plus what is inside non-weightless bags in it.

**A file without `containers`** (any older file) gets one `{ "id": "backpack", "name": "Backpack" }` and every item goes in it, silently. Deleting a container in the app moves its items to where the container was (or the first other container); the last container cannot be deleted.

`categories`: optional list of `{ "id", "name", "icon", "color" }`: your own categories, or a built-in one renamed (same id as the built-in).

## recipes

```json
"recipes": [
  {
    "id": "r1",
    "name": "Potion of Healing",
    "inputs": [{ "name": "Moonpetal", "quantity": 2 }, { "name": "Empty vial", "quantity": 1 }],
    "output": { "name": "Potion of Healing", "quantity": 1, "template": { "category": "potion", "weight": 0.5 } },
    "time": "1 day", "tool": "Herbalism Kit", "dc": "DC 12", "note": "",
    "containerId": "backpack"
  }
],
"playCounters": [{ "name": "Moonpetal" }]
```

Inputs, the output and counters name items **by name**, not by id: case and extra spaces are ignored, and every stack of that name counts, in any container (bags, i.e. items that are a container, never count). So a recipe can be written before you own the material, and keeps working when a stack runs out, is deleted, split or merged. Renaming the last item of a name in the app renames it in recipes and counters too.

| Field | Meaning |
|---|---|
| `inputs` | Taken out on every craft. `quantity` above 0 (fractions allowed). A plain string `"Herb"` = 1 Herb. Missing name: ignored with a warning. |
| `output` | Put in on every craft: added to a stack of that name in the chosen container; else a new item from `template`; else a copy of a stack of that name elsewhere; else a plain item. A string = 1 of it. Missing: 1 of the recipe's name, with a warning. |
| `output.template` | Optional. Any [item](#items) fields except `id`, `name`, `quantity`, `containerId`, `equipped`, `attuned` (those are ignored with a warning). Read like an item. |
| `time`, `tool`, `dc`, `note` | Free text, only shown. |
| `containerId` | Where the output went last time; the Craft dialog starts there. |

**Craft ×N** is refused unless every input is there N times over; it then takes the inputs (unequipped stacks first, inventory order), adds the output and remembers the container, as one change (one Undo). A stack emptied by it is removed when another stack of that name still has some; otherwise one stays at quantity 0. `playCounters`: a name pinned twice keeps the first.

## preferences

```json
"preferences": { "gear": { "view": "hybrid", "groupBy": "container", "show": { "quantity": true, "weight": true, "category": true, "tags": true, "charges": true } } }
```

`gear.view`: `hybrid`, `tiles` or `rows` (the layout of the coming Gear redesign; stored, not used yet). `gear.groupBy`: `container`, `category` or `none`. `gear.show`: which details a row shows. Missing fields get these defaults.

Optional groups (since 2026-10-11). Each is written only once the player changes something in it; an absent group or field means the default, and a file without them is unchanged by a round trip. A version 3 app from before a group existed keeps it unchanged (with a "not a field this app uses" line in the import dialog).

| Field | Type | Default | Notes |
|---|---|---|---|
| `money.coins` | list of `pp`, `gp`, `ep`, `sp`, `cp` | `["gp"]` | The coins the Money panel of the Gear tab shows, each with its total, an amount field and − / + (take the amount from the total, add it to it). A hidden coin keeps its amount in `inventory.money`; the panel names hidden coins that are not 0 in one line. Stored most valuable first; unknown names are dropped with a warning; an empty list means the default. Taking more than there is is refused (nothing changes, a message says how much there is). |
| `play.attackOrder` | `file` or `name` | `file` | The order of the attack cards on the Play screen (and in an item's panel): as they are in `attacks`, or A to Z. Until 2026-10-11 they were always A to Z, which puts Latin names before Cyrillic ones. Other cards are not affected: features and items A to Z, spells by level, then A to Z. |
| `play.phoneStart` | `all`, `action`, `bonus`, `reaction`, `other` | `all` | What a phone (a window under 900 px) opens the Play screen with: every hand, or one hand as an active filter. Until 2026-10-11 it was always `action`, which kept Bonus Actions and Reactions off the screen until the filter was taken off. A computer always opens with every hand. |
| `play.editButtons` | true / false | true | The small Edit button on each section of the Play screen (and on Abilities, Spellcasting and Proficiencies of the Stats tab). On Play it opens a window with what that section holds: a name opens its editor on the spot, "Add" makes a new one, the arrows of the attacks change their order in `attacks`, Spell slots has "My own number of spell slots" (`spellcasting.slotsOverride`), and a last button opens the tab with the whole list, scrolled to it. |

All of these are set on the Edit tab, under "How this sheet looks"; the coins also in the Money panel. Choosing a default again removes the field from the file.

**Potions and scrolls** are ordinary items; the Play screen only reads their name (src/model/consumables.ts). An item **without `charges`** is a *scroll* if its name contains "scroll" (not "scroll case/tube"); the spell is taken from "Scroll of X", "Spell Scroll of X", "Spell Scroll (X)", "Scroll: X" or "X scroll", and its text from the character's spells, then the SRD, then the item's `description`. Otherwise it is a *potion* if its name contains "potion", "elixir" or "philter". A potion whose name also says "healing" is a *healing potion* (Healing / Greater / Superior / Supreme, from the name): a counter in the Concentration panel, not a card; its dice come from `description`, else the standard 2d4+2 / 4d4+4 / 8d4+8 / 10d4+20. Every other potion is a card in the scroll group with "Use".

## item powers

A magic item with several abilities lists them in `powers`. Each **active** power is its own card, in the hand of its
activation (Action, Bonus Action, Reaction, Free / Other); each **passive** power is a chip under "Always on", next to the
passive features. An item with at least one active power shows no card of its own: its powers are the item on the Play screen.
Powers follow the item: an item that is not equipped, or needs attunement and is not attuned, hides all its powers.

A bonus to the spell DC or spell attack is **not** a power: use the item fields `spellDcBonus` / `spellAttackBonus`.
(Older files had a passive power named like "+1 spell save DC" or "+3 spell attack"; the importer turns such a
power into the field, moves its text to the item's `description`, and equips the item if the bonus counted before.
The import dialog lists every such change.)

```json
{ "name": "Staff of Ages", "equipped": true, "requiresAttunement": true, "attuned": true, "spellAttackBonus": 3,
  "charges": { "max": 3, "used": 0, "recharge": "dawn", "regain": "1d3" },
  "powers": [
    { "name": "Temporal Echo", "activation": "reaction", "cost": "all", "description": "..." },
    { "name": "Hourglass Ward", "activation": "bonus", "cost": 1, "description": "Absorb Elements on you or an ally within 30 ft." }
  ] }
```

| Field | Notes |
|---|---|
| `id` | Generated if missing. |
| `name` | |
| `activation` | `passive`, `action`, `bonus`, `reaction`, `free`, `special` (same words and aliases as for [features](#features)). Default `action`. |
| `cost` | Charges one use takes from the item's `charges`: a number, or `"all"` = every charge left (at least 1). Leave it out (or `0`) for a free power. The card shows the item's charges and is greyed out when there are not enough. |
| `uses` | Optional [uses](#uses) of its own, separate from the item's charges ("once per long rest"). Rests restore them like any other counter. |
| `description` | Text, rendered like feature descriptions. |
| `tags` | Optional list of your own [tags](#tags). |

Using a power spends its `cost` (and one of its own `uses`). Undo gives one use and the cost back; for `"all"` it gives back one charge.

## tags

`tags` is a list of short labels on spells, features, items and item powers: `["buff", "revive"]` (a text `"buff, revive"` also works).
They are stored in lowercase, without duplicates. The app reads them in four groups:

| Group | Tags | Where they come from |
|---|---|---|
| Category | `damage`, `healing`, `control` | Read from the text (below); you can also add them yourself where the text misses. |
| | `buff`, `defense`, `mobility`, `summon` | Only yours: add them in the editor or the file. |
| | `utility` | Added by the app to anything with no other category; a category you add replaces it. |
| Damage type | `fire`, `radiant`, `psychic`, ... | Read from the text; a finer choice under Damage in the filter. An own damage type counts as Damage too. |
| Property | `concentration`, `ritual` | The spell flags. |
| Other | anything else (`staff`, `revive`) | Yours, kept and shown as written. |

Automatic tags are added every time something is shown; they are not saved in the file:

| Tag | When |
|---|---|
| `damage` and the damage type | The text has dice followed by a type ("8d6 Fire") or "Fire damage". Attacks: their `damageType`. |
| `healing` | The text says "regain(s) ... Hit Points", "heal", or "Temporary Hit Points" (not "can't regain"). |
| `control` | The text has both a saving throw and a condition (Paralyzed, Prone, Restrained...); "+1 spell save DC" is not a saving throw. |

Earlier versions of the app also had automatic `save` and `attack` tags and suggested `debuff`, `aoe` and `social`.
Those are no longer built in; if your file has them as own tags, they are kept and show under "Other tags".

**The filter** (the funnel on the Play screen and the Spells tab): groups Action (the hand), Kind, Category (with the
damage types behind a separate ▾ next to Damage), Properties and Other tags. Inside one group any chosen option is enough
(Action or Bonus; Healing or Buff); across groups all must hold (an Action card that heals). Chosen damage types narrow
Damage down to those types. The active filters are listed under the controls, each with ✕.

## experience

The GM gives XP for the whole group; the Level Up tab divides it by `partySize` (rounded **down**) and adds the share to `xp`.
Every change goes into `xpLog`, oldest first; "Undo" takes back the newest entry (subtracts its `amount`).

```json
{ "id": "…", "date": "2026-09-29", "kind": "session", "amount": 2469, "groupXp": 12345, "players": 5 }
{ "id": "…", "date": "2026-09-29", "kind": "correction", "amount": 48450 }
```

| Field | Notes |
|---|---|
| `date` | Local date, YYYY-MM-DD. |
| `kind` | `session` (a share of the group's XP) or `correction` (the total set by hand). |
| `amount` | What was added to `xp`; negative for a correction downwards. |
| `groupXp`, `players` | Session only: the group's XP and how many shared it. |

The next level is measured against the **total** character level (Paladin 5 / Sorcerer 9 = 14), by the 5e table
(300, 900, 2 700 … 355 000). The level is never raised by itself: the sheet shows "New level ready" and Level Up does the rest.

## timers

Countdowns in days: `{ "name": "King's wedding", "days": 12, "start": 12, "note": "bring a gift" }`.

| Field | Notes |
|---|---|
| `name` | Text. A plain string `"Rent"` also works (0 days). |
| `days` | Days left, 0 or more. **0 = ended**: the timer stays, marked, until deleted or restarted. |
| `start` | What Restart goes back to. Defaults to `days`. |
| `note` | Optional text. |

A Long Rest takes 1 day off every timer above 0. "Days pass" on the Story tab takes several off at once.

## images

Maps of the campaign and other pictures (the Images tab), in the order shown. Optional: a character without images has no `images` field.

```json
"images": [
  { "id": "world", "name": "World map", "width": 1616, "height": 904, "bytes": 412345,
    "thumb": "data:image/jpeg;base64,...", "data": "data:image/jpeg;base64,..." }
]
```

| Field | Notes |
|---|---|
| `id` | Text, unique among the images. Made up when missing. |
| `name` | Shown under the thumbnail and in the viewer. |
| `width`, `height` | Size of the picture in pixels. Read from the picture on import when missing. |
| `bytes` | Size of the picture in bytes. Computed from `data` on import. |
| `thumb` | A small preview (data URL, about 320 px) for the grid. Made on import when missing. |
| `data` | **Only in exported files:** the picture itself, as a data URL of a JPEG, PNG, WebP or GIF (`data:image/jpeg;base64,...`). |
| `pins`, `routes` | Optional. What the player marked on this picture: see "Marks on a map" below. Each is absent when there are none. |
| `scale` | Optional. What a distance on this picture is in the world; with it routes show their length. See below. |

Where the pictures live: the character in the browser (localStorage, about 5 MB for everything) keeps only the list above
without `data`; the pictures are in the browser's IndexedDB. **Export** puts each picture into its entry as `data`,
so the file carries them to another device; **import** takes `data` out again and stores it. A file with images is large
(the pictures plus about a third: base64); "Export without images" on the Images tab writes a small file with no `images` field.

Importing over an existing character ("Replace existing"): a file **without** an `images` field says nothing about images,
so the images already in the browser stay. A file **with** the field (even `[]`) replaces the list. An entry without `data`
keeps the picture the browser already has under the same `id`; if it has none, the tile says "not on this device".

New images added in the app are stored with the long side at most 2400 px (a choice on the tab: 1600 / 2400 / 3200 / the original file),
as JPEG; a picture that needs no shrinking and whose original file is smaller than the JPEG is kept as it is.

### Marks on a map

Since 2026-10-11, optional, schema 3. The player marks a picture in the viewer of the Images tab: the viewer opens for
**looking** (a tap on a mark shows its name and note, nothing can be moved); **Edit map** in the bar under the picture turns
editing on. The marks are fields of the image's own entry, each absent when empty, so an image nobody marked is written
exactly as before, and a file without marks is unchanged by import and export.

**Places are relative to the picture, not pixels:** `x` 0 is its left edge and 1 its right edge, `y` 0 its top and 1 its
bottom. A mark stays on its spot whatever size the picture is stored at. The app writes 5 decimals. On screen a mark keeps
one size at every zoom: zooming in moves the marks apart, it does not enlarge them.

```json
"pins": [
  { "id": "pin-emberhold", "name": "Emberhold", "x": 0.39286, "y": 0.42339, "note": "The capital. The smith is here.", "color": "#4f93db", "icon": "star" }
]
```

| Field of a pin | Notes |
|---|---|
| `id` | Text, unique among the pins of the image. Made up when missing. |
| `name` | Written under the pin. "Pin 1", "Pin 2"... when missing. |
| `x`, `y` | The place, 0 to 1 (see above). Out of range is pulled to the edge; missing means the middle; both with a warning. |
| `note` | Optional free text, shown when the pin is tapped. |
| `color` | Optional `#rrggbb`. Absent = red (`#d0583f`). Anything else is dropped with a warning. |
| `icon` | Optional shape: `pin` (default; it points at the place with its tip), `dot`, `star`, `flag`, `house`, `tent`, `cross`, `danger`, `question` (these sit on the place with their centre). |

```json
"routes": [
  { "id": "route-north", "name": "The north road", "points": [ { "x": 0.1, "y": 0.2 }, { "x": 0.4, "y": 0.35 }, { "x": 0.8, "y": 0.3 } ], "color": "#a274e0", "perDay": 48 }
],
"scale": { "a": { "x": 0.24359, "y": 0.77502 }, "b": { "x": 0.75641, "y": 0.86669 }, "distance": 48, "unit": "mi", "perDay": 24 }
```

| Field of a route | Notes |
|---|---|
| `id`, `name` | As for a pin. "Route 1"... when the name is missing. Any number of routes on one map. |
| `points` | The line, in order: a list of `{ x, y }`. At least one; a route without points is dropped with a warning. |
| `color` | Optional `#rrggbb`. Absent = orange (`#f0a24a`). |
| `perDay` | Optional number above 0: how far those who take this route go in a day, in the unit of the map's scale (a ship, horses). Absent = the scale's own `perDay`. |

| Field of `scale` | Notes |
|---|---|
| `a`, `b` | Two different places on the picture, each `{ x, y }`: the ends of a distance the player knows (the map's own scale bar, two towns). |
| `distance` | How far it is from `a` to `b` in the world. A number above 0. |
| `unit` | Optional text written after a length. Absent = `mi`. |
| `perDay` | Optional number above 0: a day of travel in that unit (24 miles is the usual pace on foot, and what the app proposes for a new scale in miles). Absent = routes show their length but no days. |

A scale that cannot measure (the same point twice, no distance) is dropped with a warning. **Without a scale a route shows
no numbers at all.** With one, its length is the sum of its stretches, measured on the picture's own proportions
(`width` × `height`), divided by the length of `a`–`b` and multiplied by `distance`; days = length ÷ `perDay`. Lengths are
straight lines between the points: a winding road needs more points. Under 10 the app shows one decimal, above it whole numbers.

The marks live on the image, so **"Export without images" writes no marks either**; importing that file over the same
character ("Replace existing") keeps the images and their marks, like the pictures. A version 3 app from before the marks
keeps them unchanged (with a "not a field this app uses" line in the import dialog).

## roleplay

All text: `appearance`, `personality`, `ideals`, `bonds`, `flaws`, `voice`, `mannerisms`, `goals`, `backstory`, `allies`, `notes`.
Blank lines separate paragraphs.

## Versioning

`schemaVersion` is 3. When the format changes, the app bumps it and converts older files on import, one step per version
(`MIGRATIONS` in `src/model/normalize.ts`). Files from a newer app version are rejected with a clear message.

| Version | What changed | Conversion of older files |
|---|---|---|
| 1 | First format. | |
| 2 | New optional fields: `tags` (spells, features, items, item powers) and `powers` (items). Unknown fields are kept instead of dropped. | None needed: every version 1 field means the same in version 2, so a version 1 file imports unchanged and is exported as version 2. Item descriptions are **not** split into powers automatically (that would be guessing at rules text); add powers on the Gear tab or in the file. |
| 3 | New fields: `partySize`, `xpLog` (experience log) and `timers` (day timers). Items: `spellDcBonus`, `spellAttackBonus`. | A version 2 file gets `partySize` 5 and empty `xpLog` and `timers`; `xp` keeps its value. A passive item power named like "+1 spell save DC" / "+3 spell attack" becomes the item's `spellDcBonus` / `spellAttackBonus` (its text goes to the item's `description`); if the item counted before but is not equipped, it is equipped, so the DC and spell attack stay the same. This conversion runs on every import, so version 3 files saved before these fields existed are converted too. Attacks: `itemId` (see attacks); a missing `itemId` is filled in on every import, the same way. Inventory (2026-10-01): `containers`, `categories`, item `containerId` and `category`, top-level `preferences`; crafting (2026-10-01): top-level `recipes` and `playCounters`. A file without containers gets one Backpack with every item in it, on every import. These are optional additions, so the version stayed 3: a version 3 app without containers opens such a file and keeps the new fields unchanged. |

Added without a new version (optional fields, older files read the same): `exhaustionRules`, `images`, feature `poolId` and `cost` (2026-10-03); the marks on a map, image `pins`, `routes` and `scale` (2026-10-11).

**Careful with older copies of the app:** a copy from before the Images tab keeps `images` as an unknown field, pictures included, and then
cannot save the character (the browser's localStorage is too small); give it a file exported without images.
Also: an app refuses files of a newer version ("Update the app"): a version 2 app refuses version 3 files. Export from the app you will import into.

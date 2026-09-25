// Table-side rules reference (English). Content, not UI strings: a Bulgarian version would be
// a sibling file rulesHelp.bg.ts with the same shape.
//
// 2024 statements were checked against SRD 5.2.1 text (see comments with the SRD section).
// 2014 statements describe the 2014 Player's Handbook / SRD 5.1 from general knowledge and
// were not re-checked line by line, except where noted.

export interface ChangeRow {
  topic: string
  before: string
  now: string
}

export const TURN_SUMMARY = [
  '**Move** up to your Speed. You can split it around your action.',
  '**One action.** Attack, Dash, Disengage, Dodge, Help, Hide, Influence, Magic, Ready, Search, Study, Utilize, or an action from a feature.',
  '**One Bonus Action**, only if a feature or spell gives you one.',
  '**One Reaction** per round (it comes back at the start of your turn), e.g. an Opportunity Attack or Shield.',
  '**One free object interaction** during your move or action (draw a sword, open a door). A second one needs the Utilize action.',
  '**One spell with a spell slot per turn.** You can\'t cast a slot spell with your action and another with your Bonus Action on the same turn. Cantrips don\'t count.',
]

// SRD 5.2.1 Rules Glossary, Playing the Game, Spells, Classes, Character Origins, Feats.
export const CHANGES: ChangeRow[] = [
  {
    topic: 'Race -> Species',
    before: '"Race" gave ability score increases and traits.',
    now: '"Species" gives only traits (Darkvision, Breath Weapon...). No ability score increases from species.',
  },
  {
    topic: 'Background',
    before: 'Skills, tools, languages, a flavor feature.',
    now: 'Gives your ability score increases (+2/+1 or +1/+1/+1 among three listed abilities), two skills, a tool, and an Origin feat (e.g. Acolyte -> Magic Initiate).',
  },
  {
    topic: 'Feats',
    before: 'Optional; taken instead of an ASI.',
    now: 'Four categories: Origin (level 1), General (level 4+), Fighting Style, Epic Boon (level 19). Ability Score Improvement is itself a General feat.',
  },
  {
    topic: 'Subclass level',
    before: 'Varied: level 1 (Cleric, Sorcerer, Warlock), 2 (Druid, Wizard), 3 (the rest).',
    now: 'Level 3 for every class.',
  },
  {
    topic: 'Weapon Mastery',
    before: 'Did not exist.',
    now: 'Barbarian, Fighter, Paladin, Ranger and Rogue use mastery properties (Sap, Slow, Topple, Vex, Nick, Cleave, Graze, Push) of a few chosen weapon kinds; you can swap after a Long Rest.',
  },
  {
    topic: 'Exhaustion',
    before: 'Six levels, each with a different effect (disadvantage on checks, speed halved, ...).',
    now: 'Six levels; each level: -2 to every D20 Test and -5 ft Speed. Level 6 = death. A Long Rest removes 1 level.',
  },
  {
    topic: 'Long Rest and Hit Dice',
    before: 'Regain half your Hit Dice (checked against SRD 5.1).',
    now: 'Regain ALL spent Hit Point Dice and all HP.',
  },
  {
    topic: 'Heroic Inspiration',
    before: '"Inspiration": advantage on one roll, given by the GM.',
    now: '"Heroic Inspiration": reroll any one die right after rolling it. Humans gain it on every Long Rest.',
  },
  {
    topic: 'Spells known vs. prepared',
    before: 'Bards, Sorcerers, Warlocks, Rangers knew a fixed list; Clerics, Druids, Paladins, Wizards prepared.',
    now: 'Every class has a Prepared Spells number in its table. When you may change the list differs by class: read "Changing Your Prepared Spells" in your class\'s Spellcasting feature.',
  },
  {
    topic: 'Paladin and Ranger magic',
    before: 'Spellcasting started at level 2.',
    now: 'Spellcasting starts at level 1. For multiclass spell slots, half your Paladin/Ranger levels round UP.',
  },
  {
    topic: 'Smites',
    before: 'Divine Smite was a class feature using a slot after a hit.',
    now: 'Divine Smite is a level 1 spell cast as a Bonus Action after you hit. Paladins can cast it once per Long Rest without a slot. Remember: one slot spell per turn.',
  },
  {
    topic: 'New and renamed actions',
    before: 'Use an Object, Cast a Spell, Search.',
    now: 'Utilize (use an object), Magic (cast a spell or use a magic item), Search (Wisdom), Study (Intelligence), Influence (social). Drinking a potion is a Bonus Action.',
  },
  {
    topic: 'Grapple and Shove',
    before: 'Special attacks: Athletics contest.',
    now: 'Options of your Unarmed Strike. The target makes a Strength or Dexterity save against DC 8 + Strength mod + PB.',
  },
  {
    topic: 'Surprise',
    before: 'Surprised creatures lost their first turn.',
    now: 'Surprised creatures have Disadvantage on their Initiative roll. That\'s all.',
  },
  {
    topic: 'Jack of All Trades',
    before: 'Also added to Initiative (a Dexterity check).',
    now: 'Only to ability checks that use a skill you are not proficient in, so not to Initiative.',
  },
  {
    topic: 'Cantrips when multiclassing',
    before: 'Cantrip damage scaled with character level.',
    now: 'Same: based on total character level. Most cantrip text now says "Cantrip Upgrade".',
  },
  {
    topic: 'Bloodied',
    before: 'Informal word.',
    now: 'A defined term: at half HP or less. Some features trigger on it.',
  },
]

export const REST_TIPS = [
  '**Short Rest (1 hour):** spend Hit Point Dice (roll + Con mod each, minimum 1). Features that say "Short Rest" come back. Warlocks regain Pact Magic slots. Some features regain only part (Rage, Channel Divinity, Wild Shape, Second Wind: 1 use).',
  '**Long Rest (8 hours, at least 6 asleep):** all HP, all Hit Point Dice, all spell slots, all features; Exhaustion -1; Temporary HP end. One Long Rest per 16 hours.',
  'A rest is interrupted by rolling Initiative, casting a non-cantrip spell, or taking damage (and for a Long Rest, 1 hour of walking).',
  'In this app: the rest buttons "untap" every card that the rest restores. Items that regain charges with a roll (e.g. 1d6+1 at dawn) are listed so you can roll.',
]

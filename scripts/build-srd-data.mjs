// Builds the rules data in src/data/srd/ from a Markdown transcription of SRD 5.2.1.
//
// Source: https://github.com/downfallx/dnd-5e-srd-markdown (CC-BY-4.0), itself a
// transcription of the official SRD 5.2.1 PDF by Wizards of the Coast (CC-BY-4.0).
//
// Usage:  node scripts/build-srd-data.mjs <path-to-cloned-markdown-repo>
//
// The generated JSON is committed, so the app never needs this script at runtime.
// Re-run it only when the source changes. Tests in src/data/srd.test.ts check the
// parsed tables against the official multiclass spell-slot table.

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const srcDir = process.argv[2]
if (!srcDir) {
  console.error('Usage: node scripts/build-srd-data.mjs <path-to-srd-markdown-repo>')
  process.exit(1)
}
const outDir = path.resolve(import.meta.dirname, '..', 'src', 'data', 'srd')
fs.mkdirSync(outDir, { recursive: true })

const read = (f) => fs.readFileSync(path.join(srcDir, f), 'utf8').replace(/\r\n/g, '\n')

let sourceCommit = 'unknown'
try {
  sourceCommit = execSync('git rev-parse HEAD', { cwd: srcDir }).toString().trim()
} catch {
  /* not a git checkout */
}

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const ABILITY = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
}

// ---------- tiny HTML table helpers ----------

function cellText(html) {
  return html
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parses the first <table> in `html` into { head: string[][], rows: string[][] }. */
function parseTable(html) {
  const head = []
  const rows = []
  const theadMatch = html.match(/<thead>([\s\S]*?)<\/thead>/)
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/)
  const rowRe = /<tr>([\s\S]*?)<\/tr>/g
  const cellRe = /<t([hd])([^>]*)>([\s\S]*?)<\/t[hd]>/g
  const parseRows = (block, into) => {
    if (!block) return
    let r
    while ((r = rowRe.exec(block))) {
      const cells = []
      let c
      while ((c = cellRe.exec(r[1]))) {
        const span = Number((c[2].match(/colspan="(\d+)"/) || [])[1] || 1)
        const text = cellText(c[3])
        cells.push(text)
        for (let i = 1; i < span; i++) cells.push(text)
      }
      into.push(cells)
    }
  }
  parseRows(theadMatch && theadMatch[1], head)
  parseRows(tbodyMatch && tbodyMatch[1], rows)
  return { head, rows }
}

/** Converts HTML tables inside a text block into simple pipe rows, keeping other text. */
function tablesToText(md) {
  return md.replace(/<table>[\s\S]*?<\/table>/g, (t) => {
    const { head, rows } = parseTable(t)
    const lines = []
    const lastHead = head.length ? head[head.length - 1] : null
    if (head.length) {
      // merge multi-row headers column-wise
      const width = Math.max(...head.map((h) => h.length))
      const merged = []
      for (let i = 0; i < width; i++) {
        merged.push(
          head
            .map((h) => h[i] || '')
            .filter(Boolean)
            .filter((v, idx, arr) => arr.indexOf(v) === idx)
            .join(' '),
        )
      }
      lines.push('| ' + merged.join(' | ') + ' |')
    }
    for (const r of rows) {
      const cells = [...r]
      while (cells.length && cells[cells.length - 1] === '' && lastHead && cells.length > lastHead.length) cells.pop()
      lines.push('| ' + cells.join(' | ') + ' |')
    }
    return '\n' + lines.join('\n') + '\n'
  })
}

function cleanBody(md) {
  return tablesToText(md)
    .replace(/…/g, '...')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Splits markdown into sections by a heading prefix like '#### '. */
function splitByHeading(md, prefix) {
  const lines = md.split('\n')
  const out = []
  let cur = null
  for (const line of lines) {
    if (line.startsWith(prefix) && !line.startsWith(prefix + '#')) {
      if (cur) out.push(cur)
      cur = { title: line.slice(prefix.length).trim(), body: [] }
    } else if (cur) {
      cur.body.push(line)
    }
  }
  if (cur) out.push(cur)
  return out.map((s) => ({ title: s.title, body: s.body.join('\n') }))
}

// ---------- classes ----------

function parseClasses() {
  const md = read('classes.md')
  const classBlocks = splitByHeading(md, '## ')
  const classes = []

  for (const block of classBlocks) {
    const name = block.title
    const id = slug(name)
    const body = block.body

    // core traits table (first table)
    const traits = {}
    const traitsTable = parseTable(body.slice(0, body.indexOf('</table>') + 8))
    for (const [k, v] of traitsTable.rows) traits[k] = v

    const primaryAbility = (traits['Primary Ability'] || '')
      .split(/,| and | or /)
      .map((s) => ABILITY[s.trim().toLowerCase()])
      .filter(Boolean)
    const primaryAbilityText = traits['Primary Ability'] || ''
    // "Strength or Dexterity" -> any one is enough; "Dexterity and Wisdom" -> all are required
    const primaryAbilityMode = / or /.test(primaryAbilityText) ? 'any' : 'all'
    const hitDie = Number((traits['Hit Point Die'] || '').match(/D(\d+)/i)?.[1] || 8)
    const savingThrows = (traits['Saving Throw Proficiencies'] || '')
      .split(/ and |,/)
      .map((s) => ABILITY[s.trim().toLowerCase()])
      .filter(Boolean)

    const sub = splitByHeading(body, '### ')
    const featuresSection = sub.find((s) => s.title.endsWith('Class Features'))
    const multiclassSection = sub.find((s) => s.title.startsWith('Becoming'))

    let multiclassGains = ''
    if (multiclassSection) {
      const m = multiclassSection.body.split('#### As a Multiclass Character')[1]
      if (m) multiclassGains = cleanBody(m)
    }

    // progression table
    const fsBody = featuresSection.body
    const tableHtml = fsBody.slice(fsBody.indexOf('<table>'), fsBody.indexOf('</table>') + 8)
    const { head, rows } = parseTable(tableHtml)
    const columns = []
    const top = head[0]
    const second = head[1] || []
    for (let i = 0; i < top.length; i++) {
      let label = top[i]
      if (/Spell Slots per Spell Level/.test(label)) label = `Slot ${second[i]}`
      columns.push(label)
    }
    const extraCols = []
    columns.forEach((label, i) => {
      if (i < 3) return
      extraCols.push({ key: slug(label.replace(/^Slot (\d)$/, 'slot$1')), label, index: i })
    })
    const table = rows.map((r) => {
      const values = {}
      for (const c of extraCols) {
        const v = (r[c.index] ?? '').trim()
        values[c.key] = v === '—' || v === '-' ? '' : v
      }
      return {
        level: Number(r[0]),
        features: r[2]
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s && s !== '—'),
        values,
      }
    })

    // class features: "#### Level N: Name"
    const features = []
    for (const s of splitByHeading(fsBody, '#### ')) {
      const m = s.title.match(/^Level (\d+): (.+)$/)
      if (!m) continue
      features.push({ level: Number(m[1]), name: m[2].trim(), text: cleanBody(s.body) })
    }

    // spellcasting
    let spellcasting = null
    const sc = features.find((f) => f.name === 'Spellcasting' || f.name === 'Pact Magic')
    if (sc) {
      const abil = sc.text.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) is (?:your|the) spellcasting ability/)
      let type = 'full'
      if (sc.name === 'Pact Magic') type = 'pact'
      else if (id === 'paladin' || id === 'ranger') type = 'half'
      spellcasting = { ability: abil ? ABILITY[abil[1].toLowerCase()] : null, type }
    }

    // subclasses and option groups
    const subclasses = []
    const optionGroups = []
    for (const s of sub) {
      const sm = s.title.match(/Subclass: (.+)$/)
      if (sm) {
        const subFeatures = []
        const intro = s.body.split('\n#### ')[0]
        for (const f of splitByHeading(s.body, '#### ')) {
          const m = f.title.match(/^Level (\d+): (.+)$/)
          if (!m) continue
          subFeatures.push({ level: Number(m[1]), name: m[2].trim(), text: cleanBody(f.body) })
        }
        subclasses.push({ id: slug(sm[1]), name: sm[1].trim(), description: cleanBody(intro), features: subFeatures })
      } else if (/Options$/.test(s.title)) {
        const options = splitByHeading(s.body, '#### ').map((o) => ({ name: o.title, text: cleanBody(o.body) }))
        optionGroups.push({ name: s.title, options })
      }
    }

    const subclassFeature = features.find((f) => /Subclass$/.test(f.name))
    classes.push({
      id,
      name,
      primaryAbility,
      primaryAbilityText,
      primaryAbilityMode,
      hitDie,
      savingThrows,
      skillProficiencies: traits['Skill Proficiencies'] || '',
      weaponProficiencies: traits['Weapon Proficiencies'] || '',
      toolProficiencies: traits['Tool Proficiencies'] || '',
      armorTraining: traits['Armor Training'] || '',
      multiclassGains,
      spellcasting,
      subclassLevel: subclassFeature ? subclassFeature.level : 3,
      columns: extraCols.map(({ key, label }) => ({ key, label })),
      table,
      features,
      subclasses,
      optionGroups,
    })
  }
  return classes
}

// ---------- spells ----------

function parseSpells() {
  const md = read('spells.md')
  const descStart = md.indexOf('## Spell Descriptions')
  const part = md.slice(descStart)
  const spells = []
  for (const s of splitByHeading(part, '#### ')) {
    const lines = s.body.split('\n')
    const metaLine = lines.find((l) => /^_.+_$/.test(l.trim()))
    if (!metaLine) continue
    const meta = metaLine.trim().slice(1, -1)
    let level = 0
    let school = ''
    let classes = []
    let m = meta.match(/^Level (\d) (\w+) \((.+)\)$/)
    if (m) {
      level = Number(m[1])
      school = m[2]
      classes = m[3].split(',').map((c) => c.trim())
    } else if ((m = meta.match(/^(\w+) Cantrip \((.+)\)$/))) {
      school = m[1]
      classes = m[2].split(',').map((c) => c.trim())
    } else continue
    const field = (label) => {
      // the source sometimes writes "Component:" instead of "Components:"
      for (const lb of [label, label.replace(/s$/, '')]) {
        const l = lines.find((x) => x.startsWith(`**${lb}:**`))
        if (l) return l.slice(lb.length + 5).trim()
      }
      return ''
    }
    const castingTime = field('Casting Time')
    const duration = field('Duration')
    const afterMeta = s.body.split(/\*\*Duration:\*\*.*\n/)[1] || ''
    spells.push({
      name: s.title,
      level,
      school,
      classes,
      castingTime: castingTime.replace(/ or Ritual$/, ''),
      ritual: / or Ritual$/.test(castingTime),
      range: field('Range'),
      components: field('Components'),
      duration: duration.replace(/^Concentration, /, ''),
      concentration: /^Concentration/.test(duration),
      text: cleanBody(afterMeta),
    })
  }
  return spells
}

// ---------- conditions & glossary bits ----------

function parseConditions() {
  const md = read('rules-glossary.md')
  return splitByHeading(md, '#### ')
    .filter((s) => s.title.endsWith('[Condition]'))
    .map((s) => ({ id: slug(s.title.replace(' [Condition]', '')), name: s.title.replace(' [Condition]', ''), text: cleanBody(s.body) }))
}

function parseGlossary(names) {
  const md = read('rules-glossary.md')
  const all = splitByHeading(md, '#### ')
  return names.map((n) => {
    const s = all.find((x) => x.title.replace(/ \[.*\]$/, '') === n)
    if (!s) throw new Error(`Glossary entry not found: ${n}`)
    return { name: n, text: cleanBody(s.body) }
  })
}

// ---------- feats ----------

function parseFeats() {
  const md = read('feats.md')
  const feats = []
  for (const cat of splitByHeading(md, '### ')) {
    if (!/Feats$/.test(cat.title)) continue
    for (const f of splitByHeading(cat.body, '#### ')) {
      const text = cleanBody(f.body)
      const category = (text.match(/^_([^_]+)_/) || [])[1] || cat.title
      feats.push({ name: f.title, category, text })
    }
  }
  return feats
}

// ---------- species & backgrounds ----------

function parseOrigins() {
  const md = read('character-origins.md')
  const bgPart = md.slice(md.indexOf('### Background Descriptions'), md.indexOf('## Character Species'))
  const backgrounds = splitByHeading(bgPart, '#### ').map((b) => ({ name: b.title, text: cleanBody(b.body) }))
  const spPart = md.slice(md.indexOf('### Species Descriptions'))
  const species = splitByHeading(spPart, '#### ').map((s) => {
    const text = cleanBody(s.body)
    const speed = Number((text.match(/Speed:\*\*\s*(\d+)/) || text.match(/Speed[^\d]{0,20}(\d+) feet/) || [])[1] || 30)
    // traits are paragraphs starting with _Name._ ; following plain paragraphs belong to the same trait
    const traits = []
    for (const para of text.split(/\n\n/)) {
      const m = para.match(/^_([^_]+?)\._\s*([\s\S]*)$/)
      if (m) traits.push({ name: m[1].trim(), text: m[2].trim() })
      else if (traits.length && !/^\*\*/.test(para)) traits[traits.length - 1].text += '\n\n' + para.trim()
    }
    return { name: s.title, speed, text, traits }
  })
  return { backgrounds, species }
}

// ---------- write ----------

const meta = {
  source: 'System Reference Document 5.2.1 (Wizards of the Coast), via Markdown transcription https://github.com/downfallx/dnd-5e-srd-markdown',
  sourceCommit,
  license: 'CC-BY-4.0',
  generated: new Date().toISOString().slice(0, 10),
}

const write = (file, data) => {
  fs.writeFileSync(path.join(outDir, file), JSON.stringify({ meta, data }, null, 1) + '\n')
  console.log('wrote', file)
}

const classes = parseClasses()
write('classes.json', classes)
write('spells.json', parseSpells())
write('conditions.json', parseConditions())
write(
  'glossary.json',
  parseGlossary([
    'Action',
    'Bonus Action',
    'Reaction',
    'Concentration',
    'Short Rest',
    'Long Rest',
    'Hit Point Dice',
    'Temporary Hit Points',
    'Death Saving Throw',
    'Heroic Inspiration',
    'Attunement',
    'Ritual',
    'Advantage',
    'Disadvantage',
    'Opportunity Attacks',
    'Initiative',
    'Surprise',
    'Bloodied',
    'Unarmed Strike',
    'Grappling',
    'Critical Hit',
    'Stable',
    'Dead',
    'Attack',
    'Dash',
    'Disengage',
    'Dodge',
    'Help',
    'Hide',
    'Influence',
    'Magic',
    'Ready',
    'Search',
    'Study',
    'Utilize',
  ]),
)
write('feats.json', parseFeats())
write('origins.json', parseOrigins())

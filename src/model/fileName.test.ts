// The file name of an exported hero. Until 2026-10-11 a name written entirely in Cyrillic ("Грав Сращите")
// became character.json: every such hero exported to the same file name.
import { describe, expect, it } from 'vitest'
import { fileNameFor } from './storage'

const f = (name: string) => fileNameFor({ name })

describe('fileNameFor', () => {
  it('a Latin name, as before', () => {
    expect(f('Borin Stonehand')).toBe('borin-stonehand.json')
    expect(f("  Nym's 2nd Hero!  ")).toBe('nym-s-2nd-hero.json')
  })
  it('a Bulgarian name is transliterated', () => {
    expect(f('Грав Сращите')).toBe('grav-srashtite.json')
    expect(f('Борик Синепръчковия')).toBe('borik-sineprachkovia.json')
    expect(f('Мария Иянова')).toBe('maria-iyanova.json')
    expect(f('Жечо Щърбанов-Юмрука')).toBe('zhecho-shtarbanov-yumruka.json')
  })
  it('a mixed name keeps both parts', () => {
    expect(f('Грав (lv 14)')).toBe('grav-lv-14.json')
  })
  it('accents are dropped, not the letter', () => {
    expect(f('Émile Ångström')).toBe('emile-angstrom.json')
  })
  it('letters of other scripts are kept rather than lost', () => {
    expect(f('Ἀχιλλεύς')).toBe('αχιλλευς.json')
    expect(f('勇者 3')).toBe('勇者-3.json')
  })
  it('a name with no letter or digit at all falls back to "character"', () => {
    expect(f('')).toBe('character.json')
    expect(f('!!! ???')).toBe('character.json')
  })
  it('a very long name is cut, without a hyphen left at the end', () => {
    const name = f(`${'a'.repeat(79)} b c`)
    expect(name).toBe(`${'a'.repeat(79)}.json`)
  })
})

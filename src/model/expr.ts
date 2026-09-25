// A tiny, safe formula evaluator for hand-written character JSON.
//
// Supported:  numbers, + - * /, parentheses, unary minus,
//             functions min(a,b,...), max(a,b,...), floor(x), ceil(x)
//             identifiers resolved by the caller: str, dex, con, int, wis, cha (modifiers),
//             pb, level, <classId> (level in that class), <classId>.<column> (value from the
//             class table at the current class level, e.g. barbarian.rages).
// Unknown identifiers resolve to 0 and are reported in `unknown`.
// No eval(), no property access, nothing else: a bad formula can only produce NaN.

export type Resolver = (name: string) => number | undefined

type Token = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
    } else if (/[0-9.]/.test(c)) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      out.push({ t: 'num', v: Number(src.slice(i, j)) })
      i = j
    } else if (/[a-zA-Z_]/.test(c)) {
      // name, optionally followed by ".column-slug"; a hyphen counts as part of the
      // column slug only after the dot and only when a letter follows ("rage-damage"),
      // so "wis-1" and "barbarian.rages-1" still read as subtraction.
      let j = i
      let afterDot = false
      while (j < src.length) {
        const ch = src[j]
        if (/[a-zA-Z0-9_]/.test(ch)) j++
        else if (ch === '.' && !afterDot && /[a-zA-Z]/.test(src[j + 1] ?? '')) {
          afterDot = true
          j++
        } else if (ch === '-' && afterDot && /[a-zA-Z]/.test(src[j + 1] ?? '')) j++
        else break
      }
      out.push({ t: 'id', v: src.slice(i, j).toLowerCase() })
      i = j
    } else if ('+-*/(),'.includes(c)) {
      out.push({ t: 'op', v: c })
      i++
    } else {
      throw new Error(`Unexpected character "${c}"`)
    }
  }
  return out
}

const FUNCS: Record<string, (args: number[]) => number> = {
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  floor: (a) => Math.floor(a[0]),
  ceil: (a) => Math.ceil(a[0]),
}

export interface EvalResult {
  value: number
  error?: string
  unknown: string[]
}

export function evaluate(formula: number | string | undefined | null, resolve: Resolver): EvalResult {
  if (typeof formula === 'number') return { value: formula, unknown: [] }
  if (formula == null || String(formula).trim() === '') return { value: 0, unknown: [] }
  const unknown: string[] = []
  let tokens: Token[]
  try {
    tokens = tokenize(String(formula))
  } catch (e) {
    return { value: NaN, error: (e as Error).message, unknown }
  }
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]
  const expectOp = (v: string) => {
    const tk = next()
    if (!tk || tk.t !== 'op' || tk.v !== v) throw new Error(`Expected "${v}"`)
  }

  function expr(): number {
    let v = term()
    for (;;) {
      const tk = peek()
      if (tk && tk.t === 'op' && (tk.v === '+' || tk.v === '-')) {
        next()
        const r = term()
        v = tk.v === '+' ? v + r : v - r
      } else return v
    }
  }
  function term(): number {
    let v = factor()
    for (;;) {
      const tk = peek()
      if (tk && tk.t === 'op' && (tk.v === '*' || tk.v === '/')) {
        next()
        const r = factor()
        v = tk.v === '*' ? v * r : v / r
      } else return v
    }
  }
  function factor(): number {
    const tk = next()
    if (!tk) throw new Error('Unexpected end of formula')
    if (tk.t === 'num') return tk.v
    if (tk.t === 'op' && tk.v === '-') return -factor()
    if (tk.t === 'op' && tk.v === '+') return factor()
    if (tk.t === 'op' && tk.v === '(') {
      const v = expr()
      expectOp(')')
      return v
    }
    if (tk.t === 'id') {
      const nt = peek()
      if (nt && nt.t === 'op' && nt.v === '(') {
        const fn = FUNCS[tk.v]
        if (!fn) throw new Error(`Unknown function "${tk.v}"`)
        next()
        const args = [expr()]
        while (peek()?.t === 'op' && peek()?.v === ',') {
          next()
          args.push(expr())
        }
        expectOp(')')
        return fn(args)
      }
      const r = resolve(tk.v)
      if (r === undefined) {
        unknown.push(tk.v)
        return 0
      }
      return r
    }
    throw new Error(`Unexpected "${tk.v}"`)
  }

  try {
    const v = expr()
    if (pos < tokens.length) throw new Error('Unexpected text after formula')
    return { value: v, unknown }
  } catch (e) {
    return { value: NaN, error: (e as Error).message, unknown }
  }
}

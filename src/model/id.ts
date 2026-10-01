// A new random id for anything in a character (items, containers, spells...). Its own module so that
// model files can make ids without importing normalize.ts (which imports them back).
export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

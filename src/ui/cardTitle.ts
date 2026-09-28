// The title of a card (Cards view): every card keeps the same room for it, two lines, so cards in one
// row start their text at the same height. A long name first gets a slightly smaller font (by its
// length, down to a floor that still reads well); if it still does not fit, the second line ends in
// "…" (CSS line-clamp on .card-name). The full name is in the zoomed card and in the tooltip.

/** The normal size of a card title, in rem (the same as .card-name in index.css). */
export const TITLE_REM = 0.98
/** The smallest a title gets; below this it is cut with "…" instead. */
export const TITLE_MIN_REM = 0.76

// Up to this many characters a name fits in two lines at the normal size on the narrowest card
// (about 12 characters a line, next to the corner gem); a font this much smaller fits proportionally more.
const FITS_AT_NORMAL = 22

/** Font size for a card title, in rem: normal for a short name, smaller for a longer one, never below the floor. */
export function titleRem(name: string): number {
  const n = name.trim().length
  if (n <= FITS_AT_NORMAL) return TITLE_REM
  // the size at which n characters would just fit in the same two lines, rounded down to 0.02rem
  const fit = Math.floor(((TITLE_REM * FITS_AT_NORMAL) / n) * 50) / 50
  return Math.max(TITLE_MIN_REM, fit)
}

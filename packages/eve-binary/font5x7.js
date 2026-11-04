/**
 * Built-in 5x7 technical font, expanded to an 8x8 A8 glyph atlas.
 *
 * The FPGA does not parse font formats. It receives this atlas as a normal
 * EVE asset (A8, 128x32, 16 columns x 4 rows of 8x8 cells) and text blobs that
 * contain one glyph index byte per character. Unsupported characters map to
 * '?'. Lowercase characters map to their uppercase glyph.
 */

export const FONT_GLYPH_SIZE = 8;
export const FONT_COLUMNS = 16;
export const FONT_ROWS = 4;
export const FONT_ATLAS_WIDTH = FONT_COLUMNS * FONT_GLYPH_SIZE;
export const FONT_ATLAS_HEIGHT = FONT_ROWS * FONT_GLYPH_SIZE;
export const FONT_ASSET_PATH = 'builtin/eve-font-5x7.evefont';

const PATTERNS = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  ';': ['00000', '01100', '01100', '00000', '01100', '00100', '01000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '\\': ['10000', '01000', '01000', '00100', '00010', '00010', '00001'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '*': ['00000', '10101', '01110', '11111', '01110', '10101', '00000'],
  _: ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  '°': ['01100', '10010', '10010', '01100', '00000', '00000', '00000'],
  '^': ['00100', '01010', '10001', '00000', '00000', '00000', '00000'],
  "'": ['00100', '00100', '00000', '00000', '00000', '00000', '00000'],
  '"': ['01010', '01010', '00000', '00000', '00000', '00000', '00000'],
};

const GLYPH_ORDER = Object.keys(PATTERNS);
export const FONT_GLYPH_COUNT = GLYPH_ORDER.length;

if (FONT_GLYPH_COUNT > FONT_COLUMNS * FONT_ROWS) {
  throw new Error('Font glyph count exceeds atlas capacity');
}

const GLYPH_INDEX = new Map(GLYPH_ORDER.map((character, index) => [character, index]));

export function glyphIndexFor(character) {
  const direct = GLYPH_INDEX.get(character);
  if (direct !== undefined) return direct;
  const upper = GLYPH_INDEX.get(character.toUpperCase());
  if (upper !== undefined) return upper;
  return GLYPH_INDEX.get('?');
}

export function glyphCount() {
  return FONT_GLYPH_COUNT;
}

/**
 * Expand the 5x7 patterns into a row-major A8 atlas. Pixel value is 0 or 255.
 * The 5x7 glyph is placed at cell offset (1, 0) inside each 8x8 cell.
 */
export function buildFontAtlas() {
  const pixels = new Uint8Array(FONT_ATLAS_WIDTH * FONT_ATLAS_HEIGHT);
  GLYPH_ORDER.forEach((character, glyphIndex) => {
    const pattern = PATTERNS[character];
    const cellX = (glyphIndex % FONT_COLUMNS) * FONT_GLYPH_SIZE;
    const cellY = Math.floor(glyphIndex / FONT_COLUMNS) * FONT_GLYPH_SIZE;
    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        if (pattern[row][column] === '1') {
          pixels[(cellY + row) * FONT_ATLAS_WIDTH + cellX + column + 1] = 255;
        }
      }
    }
  });
  return {
    width: FONT_ATLAS_WIDTH,
    height: FONT_ATLAS_HEIGHT,
    glyphWidth: FONT_GLYPH_SIZE,
    glyphHeight: FONT_GLYPH_SIZE,
    columns: FONT_COLUMNS,
    rows: FONT_ROWS,
    pixelFormat: 'a8',
    pixels,
  };
}

/** Convert a string to the glyph-index byte stream consumed by the renderer. */
export function encodeGlyphText(text, maxGlyphs = 128) {
  const characters = Array.from(String(text ?? ''));
  const bytes = new Uint8Array(Math.min(characters.length, maxGlyphs));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = glyphIndexFor(characters[index]);
  }
  return bytes;
}

export function decodeGlyphText(bytes) {
  return Array.from(bytes, (index) => GLYPH_ORDER[index] || '?').join('');
}

export function glyphOrder() {
  return [...GLYPH_ORDER];
}

export { FONT_ASSET_PATH as FONT_PATH };

/**
 * Renderer text-memory limits shared by the scene packer, ROM validator, frame
 * package builder and simulator backend.
 *
 * The RTL renderer has a 4096-byte glyph-index RAM. Text object records store a
 * 12-bit byte offset and an 8-bit glyph count (`eve_renderer.sv` fields
 * [122:111] and [130:123]). Anything outside those ranges cannot be addressed
 * by the hardware and is rejected instead of being masked or wrapped.
 */

export const TEXT_MEMORY_BYTES = 4096;
export const TEXT_OFFSET_BITS = 12;
export const TEXT_LENGTH_BITS = 8;
export const TEXT_MAX_OFFSET = (1 << TEXT_OFFSET_BITS) - 1;
export const TEXT_MAX_LENGTH = (1 << TEXT_LENGTH_BITS) - 1;

/**
 * Validate a text reference against the renderer's addressable limits.
 *
 * @param {number} textOffset byte offset into the 4096-byte glyph text RAM
 * @param {number} textLength number of glyph-index bytes
 * @param {{label?: string}} [options]
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function validateTextReference(textOffset, textLength, { label = 'text object' } = {}) {
  const offset = Number(textOffset);
  const length = Number(textLength);
  if (!Number.isInteger(offset) || offset < 0) {
    return { ok: false, error: `${label}: text offset ${textOffset} is not a non-negative integer` };
  }
  if (!Number.isInteger(length) || length < 0) {
    return { ok: false, error: `${label}: text length ${textLength} is not a non-negative integer` };
  }
  if (offset > TEXT_MAX_OFFSET) {
    return {
      ok: false,
      error:
        `${label}: text offset ${offset} exceeds the renderer's 12-bit range ` +
        `(0..${TEXT_MAX_OFFSET}; ${TEXT_MEMORY_BYTES}-byte text memory)`,
    };
  }
  if (length > TEXT_MAX_LENGTH) {
    return {
      ok: false,
      error:
        `${label}: text length ${length} exceeds the renderer's 8-bit range ` +
        `(0..${TEXT_MAX_LENGTH} glyphs)`,
    };
  }
  if (offset + length > TEXT_MEMORY_BYTES) {
    return {
      ok: false,
      error:
        `${label}: text range ${offset}..${offset + length} exceeds the ` +
        `${TEXT_MEMORY_BYTES}-byte renderer text memory`,
    };
  }
  return { ok: true };
}

/** Throwing wrapper used by builders that must never emit an unrenderable ROM. */
export function assertTextReference(textOffset, textLength, options) {
  const result = validateTextReference(textOffset, textLength, options);
  if (!result.ok) throw new Error(result.error);
  return result;
}

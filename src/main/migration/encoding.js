'use strict';
/**
 * Repair "mojibake": Arabic that was stored through a latin1 connection (the
 * legacy PHP code never set a connection charset) and now reads back as
 * "Ø£Ø­Ù…Ø¯" instead of "أحمد".
 *
 * MySQL's latin1 is really Windows-1252, so the repair maps every character
 * back to its cp1252 byte and decodes the bytes as UTF-8. It only applies
 * when the whole value decodes cleanly, so correctly stored text is never
 * touched.
 */

// cp1252 bytes 0x80–0x9F that differ from Latin-1.
const CP1252 = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

// A UTF-8 lead byte for Arabic (0xD8–0xDB) seen as a Latin letter.
const SUSPECT = /[Ø-Û]/;
const decoder = new TextDecoder('utf-8', { fatal: true });

function repairMojibake(value) {
  if (typeof value !== 'string' || !SUSPECT.test(value)) return value;
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    const byte = code <= 0xff ? code : CP1252[code];
    if (byte === undefined) return value;
    bytes[i] = byte;
  }
  try {
    return decoder.decode(bytes);
  } catch {
    return value;
  }
}

module.exports = { repairMojibake };

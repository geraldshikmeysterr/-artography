const floatView = new Float32Array(1);
const intView = new Int32Array(floatView.buffer);

/** Классическое преобразование IEEE-754 binary32 → binary16 с округлением. */
export function toHalf(value: number): number {
  floatView[0] = value;
  const x = intView[0];

  let bits = (x >> 16) & 0x8000;                    // знак
  let mantissa = (x >> 12) & 0x07ff;
  const exponent = (x >> 23) & 0xff;

  if (exponent < 103) return bits;                  // слишком мало — ноль
  if (exponent > 142) {                             // переполнение — бесконечность
    bits |= 0x7c00;
    bits |= (exponent === 255 ? 0 : 1) && (x & 0x007fffff);
    return bits;
  }
  if (exponent < 113) {                             // денормализованное
    mantissa |= 0x0800;
    bits |= (mantissa >> (114 - exponent)) + ((mantissa >> (113 - exponent)) & 1);
    return bits;
  }
  bits |= ((exponent - 112) << 10) | (mantissa >> 1);
  bits += mantissa & 1;                             // округление к ближайшему
  return bits;
}

export function fromHalf(bits: number): number {
  const sign = (bits & 0x8000) ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const mantissa = bits & 0x03ff;
  if (exponent === 0) return sign * Math.pow(2, -14) * (mantissa / 1024);
  if (exponent === 31) return mantissa ? NaN : sign * Infinity;
  return sign * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
}

/** Заполнение готового буфера без аллокаций — вызывается на каждый мазок. */
export function floatsToHalfArray(source: Float32Array, target: Uint16Array): void {
  for (let i = 0; i < source.length; i++) target[i] = toHalf(source[i]);
}

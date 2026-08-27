export const TERRAIN_VERTEX = /* glsl */ `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;

export const TERRAIN_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 finalColor;

uniform sampler2D uHeight;

uniform vec2  uUvOrigin;       // APRON / TEX_SIZE
uniform vec2  uUvScale;        // CHUNK_CELLS / TEX_SIZE
uniform float uSeaLevel;
uniform float uContourStep;
uniform float uMajorEvery;
uniform float uCellSize;
uniform vec3  uLandLow;
uniform vec3  uLandHigh;
uniform vec3  uWaterShallow;
uniform vec3  uWaterDeep;
uniform vec3  uLineColor;

/** Порог «производная практически ноль» — плоский участок. */
const float EPS = 1e-5;

void main() {
  vec2 uv = uUvOrigin + vUV * uUvScale;
  vec2 texel = vec2(1.0) / vec2(textureSize(uHeight, 0));

  float h  = texture(uHeight, uv).r;
  float hx = texture(uHeight, uv + vec2(texel.x, 0.0)).r
           - texture(uHeight, uv - vec2(texel.x, 0.0)).r;
  float hy = texture(uHeight, uv + vec2(0.0, texel.y)).r
           - texture(uHeight, uv - vec2(0.0, texel.y)).r;

  // Мягкое освещение по градиенту высоты: круче склон — темнее (ТЗ §5.3).
  vec3 normal = normalize(vec3(-hx, -hy, 2.0 * uCellSize));
  float lambert = clamp(dot(normal, normalize(vec3(-0.55, -0.75, 0.65))), 0.0, 1.0);

  float above = h - uSeaLevel;
  vec3 color;

  if (above >= 0.0) {
    color = mix(uLandLow, uLandHigh, clamp(above / 900.0, 0.0, 1.0));
    color *= 0.58 + 0.62 * lambert;
  } else {
    // Вода появляется автоматически ниже уровня моря (ТЗ §5.3).
    float depth = clamp(-above / 500.0, 0.0, 1.0);
    color = mix(uWaterShallow, uWaterDeep, depth);
    // Свечение на стыке рельефа и воды — как на референсе (ТЗ §5.1).
    color += vec3(0.10, 0.18, 0.22) * (1.0 - smoothstep(0.0, 28.0, -above));
  }

  // Изолинии: расстояние до ближайшей ступени, нормированное экранной
  // производной — толщина линии постоянна на любом зуме (ТЗ §5.3).
  //
  // Проверка производной на ноль обязательна: на идеально плоском участке
  // fwidth() == 0, границы smoothstep совпадают, результат вырождается и
  // вся равнина заливается цветом линии. Плоскость линий не несёт.
  // Сетка изолиний смещена на полшага: линии проходят по 32, 96, 160...
  // Ноль не попадает на уровень изолинии, иначе нетронутая равнина лежала бы
  // ровно НА линии, и её граница рисовалась бы ступеньками по ячейкам.
  float f = h / uContourStep - 0.5;
  float df = fwidth(f);
  float minor = df > EPS
    ? 1.0 - smoothstep(0.0, df * 1.1, abs(fract(f + 0.5) - 0.5))
    : 0.0;

  float fm = h / (uContourStep * uMajorEvery) - 0.5;
  float dfm = fwidth(fm);
  float major = dfm > EPS
    ? 1.0 - smoothstep(0.0, dfm * 1.1, abs(fract(fm + 0.5) - 0.5))
    : 0.0;

  float lineStrength = clamp(minor * 0.30 + major * 0.55, 0.0, 1.0);
  if (above < 0.0) lineStrength *= 0.45;
  color = mix(color, uLineColor, lineStrength);

  // Береговая линия — самая контрастная изолиния карты.
  float dc = fwidth(above);
  float coast = dc > EPS
    ? 1.0 - smoothstep(0.0, dc * 1.4, abs(above))
    : 0.0;
  color = mix(color, uLineColor, coast * 0.85);

  finalColor = vec4(color, 1.0);
}
`;

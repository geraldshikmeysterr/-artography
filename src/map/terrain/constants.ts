/** Ячеек по стороне чанка (ТЗ §5.2). */
export const CHUNK_CELLS = 64;
/** Мировых единиц на ячейку. */
export const CELL_SIZE = 8;
/** Сторона чанка в мировых единицах. */
export const CHUNK_WORLD = CHUNK_CELLS * CELL_SIZE;

/** Однопиксельный фартук по краю текстуры — без него швы на стыках чанков. */
export const APRON = 1;
export const TEX_SIZE = CHUNK_CELLS + 2 * APRON;

/**
 * Диапазон высот. Верхняя граница не произвольна: формат текстуры r16float
 * представляет целые числа точно ровно до 2048, поэтому в этом диапазоне
 * значение на GPU совпадает с CPU бит в бит.
 */
export const HEIGHT_MIN = -2048;
export const HEIGHT_MAX = 2047;

/**
 * Уровень моря по умолчанию — выше нулевой высоты нетронутой карты.
 * Мир начинается океаном, пользователь поднимает сушу. Если бы дефолт был 0,
 * вся нетронутая карта лежала бы ровно на уровне моря и граница каждого мазка
 * кисти сама становилась бы береговой линией — со ступеньками по ячейкам.
 */
export const DEFAULT_SEA_LEVEL = 64;

export const DEFAULT_CONTOUR_STEP = 64;
export const MAJOR_CONTOUR_EVERY = 5;

/** Сколько чанков держим в памяти клиента. */
export const CHUNK_CACHE_LIMIT = 256;

export const TERRAIN_PALETTE = {
  landLow: [0.086, 0.114, 0.145] as [number, number, number],
  landHigh: [0.267, 0.294, 0.318] as [number, number, number],
  waterShallow: [0.094, 0.208, 0.298] as [number, number, number],
  waterDeep: [0.031, 0.078, 0.137] as [number, number, number],
  line: [0.639, 0.761, 0.859] as [number, number, number],
};

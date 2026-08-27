import { create } from 'zustand';
import { DEFAULT_SEA_LEVEL } from '../map/terrain/constants';

interface SeaLevelState {
  value: number;
  set(value: number): void;
}

/**
 * Уровень моря карты. Отдельный маленький стор, потому что его читает
 * Pixi-слой каждый кадр, а меняет React-панель. Когда появится стор сущностей
 * (План 02), значение будет приходить из таблицы maps и писаться обратно
 * с дебаунсом — здесь останется кэш для рендера.
 */
export const useSeaLevel = create<SeaLevelState>((set) => ({
  value: DEFAULT_SEA_LEVEL,
  set: (value) => set({ value }),
}));

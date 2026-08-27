import { create } from 'zustand';
import type { Camera, Viewport } from '../map/camera';

export type ToolId = 'none' | 'region' | 'point' | 'state' | 'cultural' | 'terrain' | 'road';
export type DisplayMode = 'states' | 'cultural' | 'regions';
export type RoadType = 'major' | 'minor';

export interface Session {
  userId: string;
  username: string;
  avatarUrl: string | null;
  token: string | null;
  canEdit: boolean;
  /** Почему нет прав на редактирование; null, когда права есть. */
  canEditReason: string | null;
}

interface AppState {
  session: Session | null;
  camera: Camera;
  viewport: Viewport;
  tool: ToolId;
  roadType: RoadType;
  displayMode: DisplayMode;
  setSession: (session: Session) => void;
  setCamera: (camera: Camera) => void;
  setViewport: (viewport: Viewport) => void;
  selectTool: (tool: ToolId) => void;
  setDisplayMode: (mode: DisplayMode) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  session: null,
  camera: { x: 0, y: 0, zoom: 1 },
  viewport: { width: 1, height: 1 },
  tool: 'none',
  roadType: 'major',
  displayMode: 'states',

  setSession: (session) => set({ session }),
  setCamera: (camera) => set({ camera }),
  setViewport: (viewport) => set({ viewport }),
  setDisplayMode: (displayMode) => set({ displayMode }),

  selectTool: (tool) => {
    const { session, tool: current, roadType } = get();
    if (tool !== 'none' && session && !session.canEdit) return;
    // ТЗ §10: повторный клик по «Дороге» переключает крупная/малая.
    if (tool === 'road' && current === 'road') {
      set({ roadType: roadType === 'major' ? 'minor' : 'major' });
      return;
    }
    set({ tool: current === tool ? 'none' : tool });
  },
}));

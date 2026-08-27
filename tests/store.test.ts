import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../src/state/store';

describe('app store', () => {
  beforeEach(() => {
    useAppStore.setState({
      session: null, tool: 'none', roadType: 'major', displayMode: 'states',
    });
  });

  it('selects a tool', () => {
    useAppStore.getState().selectTool('region');
    expect(useAppStore.getState().tool).toBe('region');
  });

  it('deselects a non-road tool when picked twice', () => {
    useAppStore.getState().selectTool('region');
    useAppStore.getState().selectTool('region');
    expect(useAppStore.getState().tool).toBe('none');
  });

  it('cycles road type when the road tool is picked again', () => {
    useAppStore.getState().selectTool('road');
    expect(useAppStore.getState().roadType).toBe('major');
    useAppStore.getState().selectTool('road');
    expect(useAppStore.getState().tool).toBe('road');
    expect(useAppStore.getState().roadType).toBe('minor');
    useAppStore.getState().selectTool('road');
    expect(useAppStore.getState().roadType).toBe('major');
  });

  it('refuses to arm a drawing tool without edit rights', () => {
    useAppStore.setState({
      session: {
        userId: 'u', username: 'u', avatarUrl: null,
        token: null, canEdit: false, canEditReason: 'role-not-assigned',
      },
    });
    useAppStore.getState().selectTool('region');
    expect(useAppStore.getState().tool).toBe('none');
  });
});

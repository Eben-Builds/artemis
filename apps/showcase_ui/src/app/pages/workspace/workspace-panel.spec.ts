import { signal } from '@angular/core';
import { WorkspaceComponent } from './workspace.component';

describe('Preserved installed workspace panels', () => {
  let workspace: WorkspaceComponent;

  beforeEach(() => {
    // No injected services, session requests, phone or model execution.
    workspace = Object.create(WorkspaceComponent.prototype);
    Object.assign(workspace, {
      nestedLayout: signal({ type: 'pane', id: 'secondary', sessionId: null }),
      activePaneId: signal('secondary'),
      layoutStorageKey: 'artemis.workspace.layout.v1',
      splitDirection: signal('horizontal'),
      rightPanelWidth: signal(450),
      rightPanelHeight: signal(300),
      secondarySessionId: signal(null),
      contextMenu: signal(null),
      agentService: { loadPanelSession: jasmine.createSpy('loadPanelSession') }
    });
    spyOn(Storage.prototype, 'setItem');
    spyOn(Storage.prototype, 'removeItem');
  });

  it('splits the selected pane and keeps its original session', () => {
    workspace.splitPanel('secondary', 'vertical', 'fixture-session');
    const root = workspace.nestedLayout();
    expect(root.type).toBe('split');
    if (root.type !== 'split') return;
    expect(root.direction).toBe('vertical');
    expect(root.first).toEqual({ type: 'pane', id: 'secondary', sessionId: null });
    expect(root.second.type).toBe('pane');
    if (root.second.type === 'pane') expect(root.second.sessionId).toBe('fixture-session');
    expect(workspace.agentService.loadPanelSession).toHaveBeenCalledOnceWith('fixture-session');
  });

  it('collapses only the closed branch', () => {
    workspace.splitPanel('secondary', 'horizontal', 'fixture-session');
    workspace.closePanel('secondary');
    const remaining = workspace.nestedLayout();
    expect(remaining.type).toBe('pane');
    if (remaining.type === 'pane') expect(remaining.sessionId).toBe('fixture-session');
  });

  it('persists direction and nested layout without creating a task', () => {
    workspace.splitPanel('secondary', 'vertical', 'fixture-session');
    const call = (Storage.prototype.setItem as jasmine.Spy).calls.mostRecent();
    const saved = JSON.parse(call.args[1]);
    expect(saved.nestedLayout.direction).toBe('vertical');
    expect(saved.nestedLayout.second.sessionId).toBe('fixture-session');
    expect(workspace.agentService.loadPanelSession).toHaveBeenCalledTimes(1);
  });

  it('restores a fixture layout and requests only that panel snapshot', () => {
    spyOn(Storage.prototype, 'getItem').and.returnValue(JSON.stringify({
      direction: 'vertical', width: 420, height: 280,
      nestedLayout: { type: 'pane', id: 'secondary', sessionId: 'fixture-session' }
    }));
    (workspace as any).restoreLayout();
    expect(workspace.splitDirection()).toBe('vertical');
    expect(workspace.rightPanelWidth()).toBe(420);
    expect(workspace.agentService.loadPanelSession).toHaveBeenCalledOnceWith('fixture-session');
  });
});

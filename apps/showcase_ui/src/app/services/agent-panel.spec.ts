import { signal } from '@angular/core';
import { AgentService } from './agent.service';

describe('Preserved panel session log isolation', () => {
  let service: AgentService;

  beforeEach(() => {
    service = Object.create(AgentService.prototype);
    Object.assign(service, {
      currentSessionId: signal('fixture-main'),
      sessionLogs: signal([{ type: 'fixture-main-log' }]),
      panelLogsBySession: signal({})
    });
  });

  it('returns the main stream only for the main session', () => {
    expect(service.logsForPanelSession('fixture-main')).toEqual([{ type: 'fixture-main-log' }]);
    expect(service.logsForPanelSession('fixture-other')).toEqual([]);
  });

  it('keeps other session events out of the main stream', () => {
    (service as any).appendPanelLiveEvent('step_updated', { session_id: 'fixture-other', timestamp: 100 });
    expect(service.logsForPanelSession('fixture-other').length).toBe(1);
    expect(service.sessionLogs()).toEqual([{ type: 'fixture-main-log' }]);
    expect(service.currentSessionId()).toBe('fixture-main');
  });

  it('separates different panel streams', () => {
    (service as any).appendPanelLiveEvent('step_updated', { session_id: 'fixture-a', timestamp: 100 });
    (service as any).appendPanelLiveEvent('step_updated', { session_id: 'fixture-b', timestamp: 101 });
    expect(service.logsForPanelSession('fixture-a')[0].session_id).toBe('fixture-a');
    expect(service.logsForPanelSession('fixture-b')[0].session_id).toBe('fixture-b');
  });

  it('normalizes streamed chunks and ignores events with no session', () => {
    (service as any).appendPanelLiveEvent('llm_stream', { session_id: 'fixture-other', chunk: 'public fixture', timestamp: 100 });
    (service as any).appendPanelLiveEvent('llm_stream', { chunk: 'ignored' });
    expect(service.logsForPanelSession('fixture-other').length).toBe(1);
    expect(service.logsForPanelSession('fixture-other')[0].data.text).toBe('public fixture');
  });
});

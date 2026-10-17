/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Component, ChangeDetectionStrategy, NgZone, DestroyRef, inject, computed, signal, ViewChild, ElementRef, OnInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AgentStreamComponent } from '../../components/agent-stream/agent-stream.component';
import { FloatingVideoPlayerComponent } from '../../components/floating-video-player/floating-video-player.component';
import { AgentService } from '../../services/agent.service';

type WorkspacePane = { type: 'pane'; id: string; sessionId: string | null };
type WorkspaceSplit = {
  type: 'split';
  id: string;
  direction: 'horizontal' | 'vertical';
  ratio: number;
  first: WorkspaceNode;
  second: WorkspaceNode;
};
type WorkspaceNode = WorkspacePane | WorkspaceSplit;

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AgentStreamComponent,
    FloatingVideoPlayerComponent
],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkspaceComponent implements OnInit {
  public agentService = inject(AgentService);
  private zone = inject(NgZone);
  private destroyRef = inject(DestroyRef);

  // Default right panel width to 1/3 of the screen (or 450px as fallback)
  public rightPanelWidth = signal<number>(
    typeof window !== 'undefined' ? Math.round(window.innerWidth / 3) : 450
  );
  public rightPanelHeight = signal<number>(
    typeof window !== 'undefined' ? Math.round(window.innerHeight / 3) : 300
  );
  public splitDirection = signal<'horizontal' | 'vertical'>('horizontal');
  public isCompactViewport = signal<boolean>(typeof window !== 'undefined' && window.innerWidth <= 1150);
  public secondarySessionId = signal<string | null>(null);
  public nestedLayout = signal<WorkspaceNode>({ type: 'pane', id: 'secondary', sessionId: null });
  public activePaneId = signal<string>('secondary');
  public isDragging = signal<boolean>(false);
  public contextMenu = signal<{ x: number; y: number; sessionId: string } | null>(null);
  public dropDirection = signal<'horizontal' | 'vertical' | null>(null);
  private draggedSessionId: string | null = null;
  private readonly layoutStorageKey = 'artemis.workspace.layout.v1';
  private dragWidthRafId: number | null = null;
  private pendingDragWidth = 0;
  private pendingDragHeight = 0;
  private activeTreeResize: { splitId: string; element: HTMLElement } | null = null;
  private onViewportResize = (): void => this.isCompactViewport.set(window.innerWidth <= 1150);

  // Floating Command Bar State. taskInput is backed by a signal so computed
  // expressions (isBarExpanded) genuinely track it under OnPush.
  private taskInputSignal = signal<string>('');
  public get taskInput(): string { return this.taskInputSignal(); }
  public set taskInput(value: string) { this.taskInputSignal.set(value); }
  public isSubmitting = signal<boolean>(false);
  public errorMessage = signal<string | null>(null);
  public selectedProfile = signal<'flash' | 'pro'>('flash');

  // Expand States (Signals for 0-latency reactivity)
  public isHoveringCard = signal<boolean>(false);
  public isInputFocused = signal<boolean>(false);

  @ViewChild('dockInput') public dockInputRef?: ElementRef<HTMLTextAreaElement>;

  ngOnInit(): void {
    this.restoreLayout();
    window.addEventListener('resize', this.onViewportResize);
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('artemis_selected_profile');
      if (saved === 'flash' || saved === 'pro') {
        this.selectedProfile.set(saved);
      }
    }

    // The global ⌘K/Ctrl+K shortcut is registered outside the Angular zone so
    // ordinary typing never schedules an extra change-detection pass.
    this.zone.runOutsideAngular(() => {
      window.addEventListener('keydown', this.onGlobalKeyDown);
    });
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('keydown', this.onGlobalKeyDown);
      window.removeEventListener('resize', this.onViewportResize);
      this.detachDragListeners();
    });
  }

  /**
   * Set agent architecture profile ('flash' vs 'pro')
   */
  public setProfile(profile: 'flash' | 'pro', event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedProfile.set(profile);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('artemis_selected_profile', profile);
    }
  }

  /**
   * Computed boolean whether the currently viewed task is actively running or paused.
   * Only displays the stop/cancel button when inspecting an active task.
   */
  public isTaskRunning = computed(() => {
    return this.agentService.isCurrentSessionRunning();
  });

  /**
   * Dynamic tooltip and label indicating which task will be stopped
   */
  public stopButtonTitle = computed(() => {
    const session = this.agentService.currentSession();
    if (session?.initial_goal) {
      const truncated = session.initial_goal.length > 45
        ? session.initial_goal.substring(0, 42) + '...'
        : session.initial_goal;
      return `Stop current task: "${truncated}"`;
    }
    const curId = this.agentService.currentSessionId();
    if (curId) {
      return `Stop current task (${curId})`;
    }
    return 'Stop current running task';
  });

  /**
   * Computed boolean whether the command bar should be in its expanded state:
   * - Mouse is hovering directly on the command card
   * - Input textarea is focused
   * - User has entered task text (drafting)
   */
  public isBarExpanded = computed(() => {
    return (
      this.isHoveringCard() ||
      this.isInputFocused() ||
      this.taskInput.trim().length > 0
    );
  });

  /**
   * Focus input handler
   */
  public onInputFocus(): void {
    this.isInputFocused.set(true);
  }

  /**
   * Blur input handler
   */
  public onInputBlur(): void {
    this.isInputFocused.set(false);
  }

  /**
   * Click on the resting capsule or dock card to focus textarea
   */
  public onCardClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    // Don't steal focus if clicking action buttons or textarea directly
    if (target.closest('button') || target.tagName.toLowerCase() === 'textarea') {
      return;
    }
    this.focusInput();
  }

  /**
   * Focus textarea programmatically
   */
  public focusInput(): void {
    setTimeout(() => {
      this.dockInputRef?.nativeElement?.focus();
    }, 30);
  }

  /**
   * Clear typed task input
   */
  public clearInput(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.taskInput = '';
    if (this.dockInputRef?.nativeElement) {
      this.dockInputRef.nativeElement.style.height = 'auto';
      this.dockInputRef.nativeElement.focus();
    }
  }

  /**
   * Auto-resize textarea as user types multi-line tasks
   */
  public onTextareaInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 24), 120);
    textarea.style.height = `${newHeight}px`;
  }

  /**
   * Global keyboard shortcut (⌘K or Ctrl+K) to focus input bar from anywhere
   */
  private onGlobalKeyDown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.focusInput();
    }
  };

  /**
   * Handle enter key in floating dock textarea
   */
  public onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submitTask();
    }
  }

  /**
   * Submit a new task instruction
   */
  public submitTask(): void {
    const goal = this.taskInput.trim();
    if (!goal || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    if (this.dockInputRef?.nativeElement) {
      this.dockInputRef.nativeElement.blur();
    }
    this.isInputFocused.set(false);

    this.agentService.runTask(goal, this.selectedProfile()).subscribe({
      next: (res) => {
        this.taskInput = '';
        if (this.dockInputRef?.nativeElement) {
          this.dockInputRef.nativeElement.style.height = 'auto';
        }
        this.isSubmitting.set(false);
        this.agentService.fetchStatus();
      },
      error: (err) => {
        console.error('Failed to submit task:', err);
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.detail || 'The runner is busy. Please wait for current task to finish.');
        setTimeout(() => {
          this.errorMessage.set(null);
        }, 5000);
      }
    });
  }

  /**
   * Stop currently viewed task
   */
  public stopTask(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    if (!this.isTaskRunning()) {
      return;
    }
    const targetSessionId = this.agentService.currentSessionId();
    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.agentService.stopTask(targetSessionId, false);
    setTimeout(() => {
      this.isSubmitting.set(false);
    }, 400);
  }

  /**
   * Handle mouse down on resizer bar to start dragging. The move/up listeners
   * are attached only for the duration of the drag and run outside the Angular
   * zone: idle mouse movement over the workspace never triggers change
   * detection, and drag updates are coalesced to one per animation frame.
   */
  public onDragStart(event: MouseEvent): void {
    this.isDragging.set(true);
    event.preventDefault();
    this.zone.runOutsideAngular(() => {
      document.addEventListener('mousemove', this.onMouseMove);
      document.addEventListener('mouseup', this.onMouseUp);
    });
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.isDragging()) {
      return;
    }

    if (!this.isCompactViewport() && this.splitDirection() === 'horizontal') {
      const newWidth = window.innerWidth - event.clientX;
      const minWidth = 250;
      const maxWidth = window.innerWidth - 300;
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        this.pendingDragWidth = newWidth;
        if (this.dragWidthRafId === null) {
          this.dragWidthRafId = requestAnimationFrame(() => {
            this.dragWidthRafId = null;
            this.rightPanelWidth.set(this.pendingDragWidth);
          });
        }
      }
      return;
    }

    const newHeight = window.innerHeight - event.clientY;
    const minHeight = 180;
    const maxHeight = window.innerHeight - 180;
    if (newHeight >= minHeight && newHeight <= maxHeight) {
      this.pendingDragHeight = newHeight;
      if (this.dragWidthRafId === null) {
        this.dragWidthRafId = requestAnimationFrame(() => {
          this.dragWidthRafId = null;
          this.rightPanelHeight.set(this.pendingDragHeight);
        });
      }
    }
  };

  private onMouseUp = (): void => {
    this.isDragging.set(false);
    this.persistLayout();
    this.detachDragListeners();
  };

  private detachDragListeners(): void {
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    if (this.dragWidthRafId !== null) {
      cancelAnimationFrame(this.dragWidthRafId);
      this.dragWidthRafId = null;
    }
  }

  public onSessionContextMenu(payload: { event: MouseEvent; sessionId: string }): void {
    const menuWidth = 190;
    const menuHeight = 112;
    this.contextMenu.set({
      x: Math.min(payload.event.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(payload.event.clientY, window.innerHeight - menuHeight - 8),
      sessionId: payload.sessionId
    });
  }

  public openPaneContextMenu(panelId: string, sessionId: string | null, event: MouseEvent): void {
    if (!sessionId) return;
    this.activePaneId.set(panelId);
    this.onSessionContextMenu({ event, sessionId });
  }

  public splitSession(direction: 'horizontal' | 'vertical'): void {
    const sessionId = this.contextMenu()?.sessionId;
    this.splitPanel(this.activePaneId(), direction, sessionId || null);
    this.contextMenu.set(null);
  }

  public splitPanel(panelId: string, direction: 'horizontal' | 'vertical', sessionId: string | null = null): void {
    const makeId = () => `pane-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const addSplit = (node: WorkspaceNode): WorkspaceNode => {
      if (node.type === 'pane' && node.id === panelId) {
        return {
          type: 'split', id: `split-${makeId()}`, direction, ratio: 0.5,
          first: node,
          second: { type: 'pane', id: makeId(), sessionId }
        };
      }
      if (node.type === 'pane') return node;
      return { ...node, first: addSplit(node.first), second: addSplit(node.second) };
    };
    this.nestedLayout.update(addSplit);
    if (sessionId) this.agentService.loadPanelSession(sessionId);
    this.persistLayout();
  }

  public closePanel(panelId: string): void {
    const collapse = (node: WorkspaceNode): WorkspaceNode | null => {
      if (node.type === 'pane') return node.id === panelId ? null : node;
      if (node.first.type === 'pane' && node.first.id === panelId) return node.second;
      if (node.second.type === 'pane' && node.second.id === panelId) return node.first;
      const first = collapse(node.first);
      const second = collapse(node.second);
      if (!first) return second;
      if (!second) return first;
      return { ...node, first, second };
    };
    const next = collapse(this.nestedLayout());
    if (next) this.nestedLayout.set(next);
    this.persistLayout();
  }

  public setPanelSession(panelId: string, event: Event): void {
    const sessionId = (event.target as HTMLSelectElement).value || null;
    const update = (node: WorkspaceNode): WorkspaceNode => {
      if (node.type === 'pane') {
        if (node.id === panelId && sessionId) this.agentService.loadPanelSession(sessionId);
        return node.id === panelId ? { ...node, sessionId } : node;
      }
      return { ...node, first: update(node.first), second: update(node.second) };
    };
    this.nestedLayout.update(update);
    this.persistLayout();
  }

  public onTreeResizeStart(splitId: string, event: PointerEvent): void {
    const element = (event.currentTarget as HTMLElement).parentElement;
    if (!element) return;
    event.preventDefault();
    this.activeTreeResize = { splitId, element };
    const move = (moveEvent: PointerEvent) => {
      const active = this.activeTreeResize;
      if (!active) return;
      const bounds = active.element.getBoundingClientRect();
      const split = this.findSplit(this.nestedLayout(), active.splitId);
      if (!split) return;
      const extent = split.direction === 'horizontal' ? bounds.width : bounds.height;
      if (extent <= 0) return;
      const ratio = split.direction === 'horizontal'
        ? (moveEvent.clientX - bounds.left) / bounds.width
        : (moveEvent.clientY - bounds.top) / bounds.height;
      const minRatio = Math.min(0.45, 180 / extent);
      this.updateSplitRatio(active.splitId, Math.max(minRatio, Math.min(1 - minRatio, ratio)));
    };
    const stop = () => {
      this.activeTreeResize = null;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
      this.persistLayout();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', stop, { once: true });
  }

  private findSplit(node: WorkspaceNode, id: string): WorkspaceSplit | null {
    if (node.type === 'pane') return null;
    if (node.id === id) return node;
    return this.findSplit(node.first, id) || this.findSplit(node.second, id);
  }

  private updateSplitRatio(id: string, ratio: number): void {
    const update = (node: WorkspaceNode): WorkspaceNode => node.type === 'pane'
      ? node
      : {
          ...node,
          ratio: node.id === id ? ratio : node.ratio,
          first: update(node.first),
          second: update(node.second)
        };
    this.nestedLayout.update(update);
  }

  public closeContextMenu(): void {
    this.contextMenu.set(null);
  }

  public onSessionDragStart(sessionId: string): void {
    this.draggedSessionId = sessionId;
  }

  public startPanelSessionDrag(sessionId: string | null, event: DragEvent): void {
    if (!sessionId) {
      event.preventDefault();
      return;
    }
    this.draggedSessionId = sessionId;
    event.dataTransfer?.setData('text/plain', sessionId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  public onWorkspaceDragOver(event: DragEvent): void {
    if (!this.draggedSessionId) return;
    event.preventDefault();
    this.dropDirection.set(
      Math.abs(event.clientY - window.innerHeight / 2) > Math.abs(event.clientX - window.innerWidth / 2)
        ? 'vertical'
        : 'horizontal'
    );
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  public onWorkspaceDrop(event: DragEvent): void {
    event.preventDefault();
    const sessionId = event.dataTransfer?.getData('text/plain') || this.draggedSessionId;
    const direction = this.dropDirection();
    this.draggedSessionId = null;
    this.dropDirection.set(null);
    if (!sessionId || !direction) return;
    this.splitPanel(this.activePaneId(), direction, sessionId);
  }

  public clearDropPreview(): void {
    this.dropDirection.set(null);
  }

  public onSecondarySessionChange(event: Event): void {
    const sessionId = (event.target as HTMLSelectElement).value;
    this.secondarySessionId.set(sessionId || null);
    if (sessionId) this.agentService.loadPanelSession(sessionId);
    this.persistLayout();
  }

  private persistLayout(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(this.layoutStorageKey, JSON.stringify({
      direction: this.splitDirection(),
      width: this.rightPanelWidth(),
      height: this.rightPanelHeight(),
      secondarySessionId: this.secondarySessionId(),
      nestedLayout: this.nestedLayout()
    }));
  }

  private restoreLayout(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const saved = JSON.parse(localStorage.getItem(this.layoutStorageKey) || 'null');
      if (saved?.direction === 'horizontal' || saved?.direction === 'vertical') {
        this.splitDirection.set(saved.direction);
      }
      if (Number.isFinite(saved?.width)) this.rightPanelWidth.set(saved.width);
      if (Number.isFinite(saved?.height)) this.rightPanelHeight.set(saved.height);
      if (typeof saved?.secondarySessionId === 'string') {
        this.secondarySessionId.set(saved.secondarySessionId);
        this.agentService.loadPanelSession(saved.secondarySessionId);
      }
      if (saved?.nestedLayout?.type === 'pane' || saved?.nestedLayout?.type === 'split') {
        this.nestedLayout.set(saved.nestedLayout);
        this.loadPanelSessions(saved.nestedLayout);
      } else if (typeof saved?.secondarySessionId === 'string') {
        this.nestedLayout.set({ type: 'pane', id: 'secondary', sessionId: saved.secondarySessionId });
      }
    } catch {
      localStorage.removeItem(this.layoutStorageKey);
    }
  }

  private loadPanelSessions(node: WorkspaceNode): void {
    if (node.type === 'pane') {
      if (node.sessionId) this.agentService.loadPanelSession(node.sessionId);
      return;
    }
    this.loadPanelSessions(node.first);
    this.loadPanelSessions(node.second);
  }
}

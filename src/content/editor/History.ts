import type { ActionType } from '../../shared/types';

interface HistoryEntry {
  type: ActionType;
  undo: () => void;
  redo: () => void;
  timestamp: number;
}

export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private maxSize = 200;
  private onChangeCallbacks: Array<() => void> = [];

  push(type: ActionType, undo: () => void, redo: () => void) {
    this.undoStack.push({ type, undo, redo, timestamp: Date.now() });
    this.redoStack = [];
    if (this.undoStack.length > this.maxSize) this.undoStack.shift();
    this.notifyChange();
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    entry.undo();
    this.redoStack.push(entry);
    this.notifyChange();
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    entry.redo();
    this.undoStack.push(entry);
    this.notifyChange();
    return true;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get undoCount(): number { return this.undoStack.length; }
  get redoCount(): number { return this.redoStack.length; }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.notifyChange();
  }

  onChange(callback: () => void) {
    this.onChangeCallbacks.push(callback);
  }

  private notifyChange() {
    this.onChangeCallbacks.forEach((cb) => cb());
  }
}

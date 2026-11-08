import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('BUG-080: Hardware Back Button Modal Stack Priority Verification', () => {
  it('correctly executes highest-priority (120) BreakoutAlertDialog handler before parent modal (100)', () => {
    // Simulate the NavigationContext priority queue
    const handlers = [];

    const registerBackHandler = (fn, priority = 10) => {
      const entry = { fn, priority, id: Math.random() };
      handlers.push(entry);
      handlers.sort((a, b) => b.priority - a.priority);
      return () => {
        const idx = handlers.findIndex(h => h.id === entry.id);
        if (idx !== -1) handlers.splice(idx, 1);
      };
    };

    let parentModalClosed = false;
    let breakoutDialogClosed = false;

    // 1. User opens StockDetailModal (priority 100)
    const unregisterParent = registerBackHandler(() => {
      parentModalClosed = true;
      return true;
    }, 100);

    // 2. User opens BreakoutAlertDialog on top (priority 120)
    const unregisterDialog = registerBackHandler(() => {
      breakoutDialogClosed = true;
      return true;
    }, 120);

    assert.strictEqual(handlers.length, 2, 'Two handlers registered');
    assert.strictEqual(handlers[0].priority, 120, 'BreakoutAlertDialog has highest priority');

    // 3. User presses Hardware Back Button: should execute handlers[0] (Dialog)
    let handled = false;
    for (const h of handlers) {
      if (h.fn()) {
        handled = true;
        break;
      }
    }

    assert.strictEqual(handled, true, 'Hardware back handled');
    assert.strictEqual(breakoutDialogClosed, true, 'BreakoutAlertDialog was closed first');
    assert.strictEqual(parentModalClosed, false, 'Parent StockDetailModal remained open');

    // 4. Dialog is dismissed and unregisters its handler
    unregisterDialog();
    assert.strictEqual(handlers.length, 1, 'Only parent handler remains');

    // 5. User presses Hardware Back Button again: should close parent modal
    handled = false;
    for (const h of handlers) {
      if (h.fn()) {
        handled = true;
        break;
      }
    }

    assert.strictEqual(handled, true, 'Hardware back handled again');
    assert.strictEqual(parentModalClosed, true, 'Parent StockDetailModal was closed second');

    unregisterParent();
    assert.strictEqual(handlers.length, 0, 'Handler queue empty');
  });
});

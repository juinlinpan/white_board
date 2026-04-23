import { describe, expect, it } from 'vitest';

import { reconcileTableInteractionState } from './tableInteractionState';

describe('reconcileTableInteractionState', () => {
  it('keeps selected cells when the table stays selected after edit mode ends', () => {
    expect(
      reconcileTableInteractionState(
        {
          selectedCellIds: ['cell-1', 'cell-2'],
          editingCellId: 'cell-1',
        },
        {
          isSelected: true,
          isEditing: false,
        },
      ),
    ).toEqual({
      selectedCellIds: ['cell-1', 'cell-2'],
      editingCellId: null,
    });
  });

  it('clears selected cells after the table is deselected', () => {
    expect(
      reconcileTableInteractionState(
        {
          selectedCellIds: ['cell-1', 'cell-2'],
          editingCellId: 'cell-1',
        },
        {
          isSelected: false,
          isEditing: false,
        },
      ),
    ).toEqual({
      selectedCellIds: [],
      editingCellId: null,
    });
  });
});

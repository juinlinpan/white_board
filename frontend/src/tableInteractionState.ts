export type TableInteractionState = {
  selectedCellIds: string[];
  editingCellId: string | null;
};

type TableInteractionMode = {
  isSelected: boolean;
  isEditing: boolean;
};

const EMPTY_SELECTED_CELL_IDS: string[] = [];

export function reconcileTableInteractionState(
  state: TableInteractionState,
  mode: TableInteractionMode,
): TableInteractionState {
  if (!mode.isSelected) {
    return {
      selectedCellIds: EMPTY_SELECTED_CELL_IDS,
      editingCellId: null,
    };
  }

  if (!mode.isEditing) {
    return {
      selectedCellIds: state.selectedCellIds,
      editingCellId: null,
    };
  }

  return state;
}

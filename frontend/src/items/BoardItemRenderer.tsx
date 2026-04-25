import { type BoardItem } from '../api';
import type { SegmentEndpoint } from '../segmentData';
import { Frame, type FrameSummaryEntry } from './Frame';
import { NotePaper } from './NotePaper';
import { SegmentShape } from './SegmentShape';
import { StickyNote } from './StickyNote';
import { Table } from './Table';
import { TextBox } from './TextBox';

type Props = {
  item: BoardItem;
  childSummaries: FrameSummaryEntry[];
  childCount: number;
  className?: string;
  isSelected: boolean;
  isEditing: boolean;
  canTranslateSegment?: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onEndpointMouseDown: (
    e: React.MouseEvent<HTMLButtonElement>,
    endpoint: SegmentEndpoint,
  ) => void;
  onWaypointMouseDown: (e: React.MouseEvent<HTMLButtonElement>, waypointIndex: number) => void;
  onMidpointMouseDown: (e: React.MouseEvent<HTMLButtonElement>, segmentIndex: number) => void;
  deletingWaypointIndex?: number;
  onDoubleClick: () => void;
  onResizeMouseDown: (e: React.MouseEvent) => void;
  onToggleCollapse: () => void;
  onUpdate: (item: BoardItem) => void;
  onEditEnd: () => void;
  onTableCellInteractionStart?: () => void;
  onTableSelectedCellsChange?: (cellIds: string[]) => void;
  tableDropTargetCellId?: string | null;
  magnetEnabled?: boolean;
};

export function BoardItemRenderer({
  item,
  childSummaries,
  childCount,
  className = '',
  isSelected,
  isEditing,
  canTranslateSegment = false,
  onMouseDown,
  onContextMenu,
  onEndpointMouseDown,
  onWaypointMouseDown,
  onMidpointMouseDown,
  deletingWaypointIndex,
  onDoubleClick,
  onResizeMouseDown,
  onToggleCollapse,
  onUpdate,
  onEditEnd,
  onTableCellInteractionStart,
  onTableSelectedCellsChange,
  tableDropTargetCellId,
  magnetEnabled,
}: Props) {
  const isSegmentItem = item.type === 'line' || item.type === 'arrow';
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: item.x,
    top: item.y,
    width: item.width,
    height: item.height,
    zIndex: item.z_index,
    userSelect: 'none',
    pointerEvents: isSegmentItem ? 'none' : undefined,
  };

  const wrapperClass = `board-item board-item-type-${item.type} ${
    isSelected ? 'is-selected' : ''
  } ${className}`.trim();
  const handleMouseDownCapture = (e: React.MouseEvent) => {
    if (e.button === 1) {
      onMouseDown(e);
    }
  };
  const resizeHandle =
    isSelected && !isEditing && !isSegmentItem ? (
      <button
        type="button"
        className="board-item-resize-handle"
        onMouseDown={onResizeMouseDown}
        aria-label="Resize item"
      />
    ) : null;

  switch (item.type) {
    case 'line':
    case 'arrow':
      return (
        <div
          style={baseStyle}
          className={`${wrapperClass} board-item-segment`}
          onMouseDownCapture={handleMouseDownCapture}
        >
          <SegmentShape
            item={item}
            isSelected={isSelected}
            canTranslate={canTranslateSegment}
            onMouseDown={onMouseDown as (e: React.MouseEvent<SVGPolylineElement>) => void}
            onContextMenu={onContextMenu}
            onEndpointMouseDown={onEndpointMouseDown}
            onWaypointMouseDown={onWaypointMouseDown}
            onMidpointMouseDown={onMidpointMouseDown}
            deletingWaypointIndex={deletingWaypointIndex}
          />
          {resizeHandle}
        </div>
      );

    case 'text_box':
      return (
        <div
          style={baseStyle}
          className={wrapperClass}
          onMouseDownCapture={handleMouseDownCapture}
          onMouseDown={onMouseDown}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
        >
          <TextBox
            item={item}
            isEditing={isEditing}
            onUpdate={onUpdate}
            onEditEnd={onEditEnd}
          />
          {resizeHandle}
        </div>
      );

    case 'table':
      return (
        <div
          style={baseStyle}
          className={`${wrapperClass} board-item-table`}
          onMouseDownCapture={handleMouseDownCapture}
          onContextMenu={onContextMenu}
        >
          <Table
            item={item}
            isSelected={isSelected}
            isEditing={isEditing}
            onUpdate={onUpdate}
            onEditEnd={onEditEnd}
            onCellInteractionStart={onTableCellInteractionStart}
            onSelectedCellsChange={onTableSelectedCellsChange}
            dropTargetCellId={tableDropTargetCellId}
            magnetEnabled={magnetEnabled}
          />
          <button
            type="button"
            className="board-item-table-edge board-item-table-edge-top"
            aria-label="Move table"
            tabIndex={-1}
            onMouseDown={onMouseDown}
            onContextMenu={onContextMenu}
          />
          <button
            type="button"
            className="board-item-table-edge board-item-table-edge-right"
            aria-label="Move table"
            tabIndex={-1}
            onMouseDown={onMouseDown}
            onContextMenu={onContextMenu}
          />
          <button
            type="button"
            className="board-item-table-edge board-item-table-edge-bottom"
            aria-label="Move table"
            tabIndex={-1}
            onMouseDown={onMouseDown}
            onContextMenu={onContextMenu}
          />
          <button
            type="button"
            className="board-item-table-edge board-item-table-edge-left"
            aria-label="Move table"
            tabIndex={-1}
            onMouseDown={onMouseDown}
            onContextMenu={onContextMenu}
          />
          {resizeHandle}
        </div>
      );

    case 'sticky_note':
      return (
        <div
          style={baseStyle}
          className={wrapperClass}
          onMouseDownCapture={handleMouseDownCapture}
          onMouseDown={onMouseDown}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
        >
          <StickyNote
            item={item}
            isEditing={isEditing}
            onUpdate={onUpdate}
            onEditEnd={onEditEnd}
          />
          {resizeHandle}
        </div>
      );

    case 'note_paper':
      return (
        <div
          style={baseStyle}
          className={wrapperClass}
          onMouseDownCapture={handleMouseDownCapture}
          onMouseDown={onMouseDown}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
        >
          <NotePaper
            item={item}
            isEditing={isEditing}
            onUpdate={onUpdate}
            onEditEnd={onEditEnd}
          />
          {resizeHandle}
        </div>
      );

    case 'frame':
      return (
        <div
          style={baseStyle}
          className={wrapperClass}
          onMouseDownCapture={handleMouseDownCapture}
          onMouseDown={onMouseDown}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
        >
          <Frame
            item={item}
            childCount={childCount}
            childSummaries={childSummaries}
            onToggleCollapse={onToggleCollapse}
          />
          {resizeHandle}
        </div>
      );

    default:
      return (
        <div
          style={{
            ...baseStyle,
            background: 'rgba(200,200,210,0.7)',
            border: '1px solid rgba(130,130,150,0.4)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: '#555',
          }}
          className={wrapperClass}
          onMouseDownCapture={handleMouseDownCapture}
          onMouseDown={onMouseDown}
          onContextMenu={onContextMenu}
        >
          {item.type}
          {resizeHandle}
        </div>
      );
  }
}

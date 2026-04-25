import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { getToolbarDockPosition, Toolbar } from './Toolbar';

describe('Toolbar', () => {
  it('renders file, edit, and tool controls', () => {
    const markup = renderToStaticMarkup(
      <Toolbar
        activeTool="select"
        onToolChange={() => {}}
        onTableToolClick={() => {}}
        onImportPage={() => {}}
        onExportPage={() => {}}
        importExportDisabled={false}
        canUndo
        canRedo
        onUndo={() => {}}
        onRedo={() => {}}
        historyBusy={false}
      />,
    );

    expect(markup).toContain('File');
    expect(markup).toContain('Edit');
    expect(markup).toContain('Select');
    expect(markup).toContain('Table');
  });

  it('chooses the closest dock edge from the cursor position', () => {
    const parentRect = { left: 100, top: 50, width: 800, height: 600 };

    expect(getToolbarDockPosition(500, 60, parentRect)).toBe('top');
    expect(getToolbarDockPosition(500, 640, parentRect)).toBe('bottom');
    expect(getToolbarDockPosition(110, 350, parentRect)).toBe('left');
    expect(getToolbarDockPosition(890, 350, parentRect)).toBe('right');
  });
});

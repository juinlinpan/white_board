import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Toolbar } from './Toolbar';

describe('Toolbar', () => {
  it('renders zoom and magnet controls together', () => {
    const markup = renderToStaticMarkup(
      <Toolbar
        activeTool="select"
        onToolChange={() => {}}
        onTableToolClick={() => {}}
        onImportPage={() => {}}
        onExportPage={() => {}}
        importExportDisabled={false}
        zoom={1.7}
        resetZoom={1.5}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        onResetZoom={() => {}}
        onResetZoomAdjust={() => {}}
        magnetEnabled
        onToggleMagnet={() => {}}
        canUndo
        canRedo
        onUndo={() => {}}
        onRedo={() => {}}
        historyBusy={false}
      />,
    );

    expect(markup).toContain('1.7x');
    expect(markup).toContain('1.5x');
    expect(markup).toContain('Adjust reset zoom target');
    expect(markup).toContain('Magnet');
    expect(markup).toContain('File');
    expect(markup).toContain('Edit');
  });
});

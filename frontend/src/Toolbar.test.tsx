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
        zoom={1.7}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        onResetZoom={() => {}}
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
    expect(markup).toContain('1.0x');
    expect(markup).toContain('Magnet');
  });
});

"""Reject oversized PDF render allocations before allocating their bitmaps."""
import sys
from types import SimpleNamespace

import pytest
from ai_training.documents import render_pages

def test_total_pdf_pixel_budget_rejects_before_next_bitmap(monkeypatch):
    rendered = []
    class Bitmap:
        def to_pil(self):
            from PIL import Image
            return Image.new('RGB', (1, 1))
        def close(self): pass
    class Page:
        def get_size(self): return (2300, 2300)  # Under 25M pixels per page at 150 dpi
        def render(self, scale): rendered.append(True); return Bitmap()
        def close(self): pass
    class Document:
        def __init__(self, _): pass
        def __len__(self): return 5
        def __getitem__(self, _): return Page()
        def close(self): pass
    monkeypatch.setitem(sys.modules, 'pypdfium2', SimpleNamespace(PdfDocument=Document))
    with pytest.raises(ValueError, match='total rendered size'):
        list(render_pages(b'%PDF-1.4 synthetic', 'application/pdf'))
    assert len(rendered) == 4

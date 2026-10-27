"""Render oriented document pages and crop normalized, staff-defined regions."""
import io
import math
from pathlib import Path

from PIL import Image, ImageOps


def validate_region(region):
    if not isinstance(region, dict):
        raise ValueError('Region must be an object')
    page = region.get('page')
    if type(page) is not int or not 1 <= page <= 1000:
        raise ValueError('Region page must be a positive 1-based integer')
    values = [region.get(key) for key in ('x', 'y', 'width', 'height')]
    if not all(type(v) in (int, float) and math.isfinite(v) for v in values):
        raise ValueError('Region coordinates must be finite numbers')
    x, y, width, height = values
    if not (0 <= x < 1 and 0 <= y < 1 and width > 0 and height > 0 and x + width <= 1 and y + height <= 1):
        raise ValueError('Region must fit entirely inside its page')
    return region


def render_pages(content, content_type, dpi=150):
    if not content or len(content) > 10 * 1024 * 1024:
        raise ValueError('Document must be non-empty and at most 10 MB')
    if content_type == 'application/pdf':
        import pypdfium2 as pdfium
        if not content.startswith(b'%PDF-'):
            raise ValueError('Invalid PDF signature')
        document = pdfium.PdfDocument(content)
        try:
            if not 1 <= len(document) <= 100:
                raise ValueError('PDF must contain 1 to 100 pages')
            total_pixels = 0
            for index in range(len(document)):
                page = document[index]
                bitmap = None
                try:
                    width, height = page.get_size()
                    pixels = width * height * (dpi / 72) ** 2
                    total_pixels += pixels
                    if pixels > 25_000_000:
                        raise ValueError('PDF page is too large')
                    if total_pixels > 100_000_000:
                        raise ValueError('Split this document: total rendered size is too large')
                    bitmap = page.render(scale=dpi / 72)
                    yield bitmap.to_pil().convert('RGB').copy()
                finally:
                    if bitmap is not None:
                        bitmap.close()
                    page.close()
        finally:
            document.close()
    elif content_type in ('image/png', 'image/jpeg'):
        if not (content.startswith(b'\x89PNG\r\n\x1a\n') if content_type == 'image/png' else content.startswith(b'\xff\xd8\xff')):
            raise ValueError('Image type does not match signature')
        with Image.open(io.BytesIO(content)) as image:
            if image.width * image.height > 25_000_000:
                raise ValueError('Image is too large')
            yield ImageOps.exif_transpose(image).convert('RGB').copy()
    else:
        raise ValueError('Only PDF, PNG and JPEG documents are supported')


def content_type(path):
    suffix = Path(path).suffix.lower()
    try:
        return {'.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'}[suffix]
    except KeyError:
        raise ValueError('Expected PDF, PNG or JPEG') from None


def crop_region(pages, region):
    validate_region(region)
    if region['page'] > len(pages):
        raise ValueError('Answer region refers to a missing page')
    image = pages[region['page'] - 1]
    left = int(region['x'] * image.width)
    top = int(region['y'] * image.height)
    right = math.ceil((region['x'] + region['width']) * image.width)
    bottom = math.ceil((region['y'] + region['height']) * image.height)
    if right - left < 2 or bottom - top < 2:
        raise ValueError('Region is too small')
    return image.crop((left, top, right, bottom))

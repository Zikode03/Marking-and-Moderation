"""Regenerate the reviewed Linux x86-64 CPU inference dependency lock (requires uv)."""
import subprocess
from pathlib import Path

subprocess.check_call([
    'uv', 'pip', 'compile', 'ai_service/requirements.txt', '--python-version', '3.12',
    '--python-platform', 'x86_64-manylinux_2_28', '--torch-backend', 'cpu',
    '--generate-hashes', '--emit-index-url', '--output-file', 'deploy/requirements.ai.lock',
])
path = Path('deploy/requirements.ai.lock')
text = path.read_text(encoding='utf-8')
if '--extra-index-url https://download.pytorch.org/whl/cpu' not in text:
    text = text.replace('--index-url https://pypi.org/simple', '--index-url https://pypi.org/simple\n--extra-index-url https://download.pytorch.org/whl/cpu')
path.write_text(text, encoding='utf-8')
print('Updated the hashed CPU inference lock. Build and test the AI image before release.')

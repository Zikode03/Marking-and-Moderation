import argparse,concurrent.futures,json,re,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--backend-context',default='../Marking-and-Moderation-backend');args=parser.parse_args()
images=['clamav/clamav:stable','node:22-alpine','nginx:alpine','python:3.12-slim','caddy:2.10-alpine','mcr.microsoft.com/dotnet/sdk:10.0','mcr.microsoft.com/dotnet/aspnet:10.0']
def resolve(name):
 text=subprocess.check_output(['docker','buildx','imagetools','inspect',name],text=True,stderr=subprocess.STDOUT)
 match=re.search(r'^Digest:\s+(sha256:[0-9a-f]{64})',text,re.M)
 if not match:raise RuntimeError('No immutable digest found for '+name)
 return name,match.group(1)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:pins=dict(pool.map(resolve,images))
Path('deploy/base-images.json').write_text(json.dumps(pins,indent=2)+'\n')
root=Path(args.backend_context)
for path in [Path('Dockerfile'),Path('Dockerfile.ai'),root/'Dockerfile']:
 text=path.read_text()
 for name,digest in pins.items():text=re.sub(r'(?m)^(FROM '+re.escape(name)+r')(?:@sha256:[0-9a-f]{64})?(?=\s|$)',lambda m:m[1]+'@'+digest,text)
 path.write_text(text)
p=Path('compose.staging.yml');text=p.read_text();text=re.sub(r'image: caddy:2\.10-alpine(?:@sha256:[0-9a-f]{64})?', 'image: caddy:2.10-alpine@'+pins['caddy:2.10-alpine'],text);p.write_text(text)
text=re.sub(r'image: clamav/clamav:stable(?:@sha256:[0-9a-f]{64})?', 'image: clamav/clamav:stable@'+pins['clamav/clamav:stable'],text);p.write_text(text)
print('Pinned',len(pins),'base images to immutable registry digests.')

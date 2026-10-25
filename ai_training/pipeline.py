"""Full training workflow: python -m ai_training.pipeline --help."""
import argparse
import json
import shutil
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('labeler', help='Copy the offline visual line-label/template editor')
    p.add_argument('--output', required=True)
    p = commands.add_parser('render', help='Render oriented PDF/image pages for line labelling')
    p.add_argument('--input', required=True)
    p.add_argument('--output', required=True)
    p = commands.add_parser('prepare-ocr', help='Validate verified line labels and produce grouped splits')
    p.add_argument('--input', nargs='+', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--seed', type=int, default=42)
    for name in ('train-ocr', 'train-scorer'):
        p = commands.add_parser(name)
        p.add_argument('--data', required=True)
        p.add_argument('--output', required=True)
        p.add_argument('--epochs', type=int, default=30 if name == 'train-ocr' else 20)
        p.add_argument('--batch-size', type=int, default=8)
        p.add_argument('--rate', type=float, default=.001 if name == 'train-ocr' else .0003)
        p.add_argument('--seed', type=int, default=42)
        p.add_argument('--device', choices=('auto', 'cpu', 'cuda'), default='auto')
        p.add_argument('--resume', action='store_true')
        if name == 'train-ocr':
            p.add_argument('--height', type=int, default=48)
            p.add_argument('--max-width', type=int, default=1600)
            p.add_argument('--channels', type=int, default=32)
            p.add_argument('--hidden', type=int, default=96)
        else:
            p.add_argument('--width', type=int, default=96)
            p.add_argument('--heads', type=int, default=4)
            p.add_argument('--layers', type=int, default=2)
            p.add_argument('--max-tokens', type=int, default=2048)
            p.add_argument('--members', type=int, default=3)
    p = commands.add_parser('register-template', help='Bind reviewed questions/line regions to exact paper and memo')
    p.add_argument('--specification', required=True)
    p.add_argument('--paper', required=True)
    p.add_argument('--memo', required=True)
    p.add_argument('--output', required=True)
    p = commands.add_parser('bundle', help='Package trained components; this does not approve them')
    p.add_argument('--ocr', required=True)
    p.add_argument('--scorer', required=True)
    p.add_argument('--templates', nargs='+', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--reading-threshold', type=float, default=.85)
    p.add_argument('--max-ensemble-spread', type=float, default=.1)
    p.add_argument('--max-score-error-fraction', type=float, default=.1)
    p.add_argument('--review-threshold', type=float, default=.5)
    p = commands.add_parser('evaluate-bundle', help='Evaluate adjudicated held-out scan files end to end')
    p.add_argument('--directory', required=True)
    p.add_argument('--dataset', required=True)
    p.add_argument('--output', required=True)
    p = commands.add_parser('approve', help='Record explicit academic approval after acceptance checks')
    p.add_argument('--directory', required=True)
    p.add_argument('--evaluation', required=True)
    p.add_argument('--policy', required=True)
    p.add_argument('--reviewer', required=True)
    p.add_argument('--confirm-academic-review', action='store_true')
    p = commands.add_parser('mark', help='Run approved package on files; output remains provisional')
    p.add_argument('--directory', required=True)
    p.add_argument('--paper', required=True)
    p.add_argument('--memo', required=True)
    p.add_argument('--script', required=True)
    p.add_argument('--context', required=True, help='Path to academic context JSON')
    args = vars(parser.parse_args())
    command = args.pop('command')
    try:
        if command == 'labeler':
            destination = Path(args['output'])
            if destination.exists():
                raise ValueError('Choose a new labeler output file')
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(Path(__file__).with_name('labeler.html'), destination)
            result = {'labeler': str(destination.resolve()), 'instructions': 'Open this HTML file in your browser. All work stays local.'}
        elif command == 'render':
            from .documents import content_type, render_pages
            source, destination = Path(args['input']), Path(args['output'])
            pages = list(render_pages(source.read_bytes(), content_type(source)))
            destination.mkdir(parents=True, exist_ok=False)
            for index, page in enumerate(pages, 1):
                page.save(destination / f'page-{index:03}.png')
            result = {'pages': len(pages), 'output': str(destination)}
        elif command == 'prepare-ocr':
            from .ocr_data import prepare_ocr
            result = prepare_ocr(args['input'], args['output'], args['seed'])
        elif command == 'train-ocr':
            from .training import train_ocr
            result = train_ocr(**args)
        elif command == 'train-scorer':
            from .training import train_scorer
            result = train_scorer(**args)
        elif command == 'register-template':
            from .templates import register_template
            result = register_template(**args)
        elif command == 'bundle':
            from .bundle import bundle
            result = bundle(**args)
        elif command == 'evaluate-bundle':
            from .bundle import evaluate_bundle
            result = evaluate_bundle(**args)
        elif command == 'approve':
            from .bundle import approve
            args['confirm'] = args.pop('confirm_academic_review')
            result = approve(**args)
        else:
            from .documents import content_type
            from .runtime import load
            runner = load(args['directory'])
            files = {key: {'content': Path(args[key]).read_bytes(), 'content_type': content_type(args[key])} for key in ('paper', 'memo', 'script')}
            result = runner.mark_files(**files, request_id='local-review', academic_context=json.loads(Path(args['context']).read_text(encoding='utf-8')))
        print(json.dumps(result, ensure_ascii=True, indent=2, allow_nan=False))
    except (ValueError, OSError, KeyError, TypeError, ImportError) as error:
        parser.exit(2, f'{error}\n')


if __name__ == '__main__':
    main()

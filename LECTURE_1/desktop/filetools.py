"""Packaged document worker. The fixed operation names never execute model code."""
import runpy
import sys
from pathlib import Path

if len(sys.argv) < 3 or sys.argv[1] not in ('extract', 'render'):
    raise SystemExit('extract/render operation required')
operation = sys.argv.pop(1)
root = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
runpy.run_path(str(root / ('extract.py' if operation == 'extract' else 'render_files.py')), run_name='__main__')

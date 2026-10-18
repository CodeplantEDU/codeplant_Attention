import shutil
import subprocess
import sys
from pathlib import Path

desktop = Path(__file__).resolve().parents[1]
platform = 'win32' if sys.platform == 'win32' else 'darwin'
import platform as host
arch = 'arm64' if host.machine().lower() in ('arm64', 'aarch64') else 'x64'
root = desktop / 'runtime' / f'{platform}-{arch}' / 'filetools'
command = [sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir',
           '--name', 'attention-files', '--distpath', str(desktop / 'build' / 'py-dist'),
           '--workpath', str(desktop / 'build' / 'py-work'), '--specpath', str(desktop / 'build')]
for module in ('docx', 'pptx', 'reportlab', 'openpyxl', 'pypdf', 'PIL'):
    command += ['--collect-all', module]
for script in ('extract.py', 'render_files.py'):
    command += ['--add-data', str(desktop.parent / 'site' / 'lib' / script) + ':.']
command += [str(desktop / 'filetools.py')]
subprocess.run(command, check=True)
shutil.copytree(desktop / 'build' / 'py-dist' / 'attention-files', root, dirs_exist_ok=True)
print(f'Document engine ready: {platform}-{arch}')

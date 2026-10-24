# Where the music tools find ffmpeg: the copy Remotion installed for this computer
# (mirrors engine/lib/platform.mjs). Import FFMPEG and ENV; STUDIO and TMP are the kit folder and
# a temp folder that exist on every computer, wherever the kit was unpacked.
import os, sys, platform, tempfile

ENGINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STUDIO = os.path.dirname(ENGINE)
TMP = tempfile.gettempdir()
_arm = platform.machine().lower() in ('arm64', 'aarch64')
if sys.platform == 'darwin': _cid = 'darwin-arm64' if _arm else 'darwin-x64'
elif sys.platform == 'win32': _cid = 'win32-x64-msvc'
else: _cid = 'linux-arm64-gnu' if _arm else 'linux-x64-gnu'
FF = os.path.join(ENGINE, 'node_modules', '@remotion', 'compositor-' + _cid)
FFMPEG = os.path.join(FF, 'ffmpeg.exe' if sys.platform == 'win32' else 'ffmpeg')
ENV = dict(os.environ)
if sys.platform == 'darwin': ENV['DYLD_LIBRARY_PATH'] = FF
elif sys.platform == 'win32': ENV['PATH'] = FF + os.pathsep + ENV.get('PATH', '')
else: ENV['LD_LIBRARY_PATH'] = FF + os.pathsep + ENV.get('LD_LIBRARY_PATH', '')

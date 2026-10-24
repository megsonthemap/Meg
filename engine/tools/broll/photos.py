#!/usr/bin/env python3
# The Apple Photos half of the b-roll organiser (macOS only). broll.mjs runs this with the Python in
# engine/.venv/broll and reads one JSON object from stdout. Progress goes to stderr.
#
#   photos.py check                     can we read the library; the named faces; existing albums
#   photos.py scan    <config.json>     counts per bucket, plus a few thumbnails each. Writes nothing.
#   photos.py build   <config.json> --yes   create the albums and add what scan found. Never removes.
#   photos.py find    <config.json>     the items in one bucket's album, newest first
#   photos.py export  <uuid> <dest dir> one original into dest (downloads it from iCloud if needed)
#
# Reading uses osxphotos (needs Full Disk Access for the app running Claude). Writing uses
# photoscript, which drives the Photos app (macOS asks once: "allow ... to control Photos").
import json
import os
import re
import shutil
import sys
from datetime import datetime

RAW = re.compile(r'^(IMG_\d|IMG_E\d|VID_?\d{8}|PXL_\d{8}|MVI_|MOV_\d|DSC|DSCF|DJI_|GOPR|GH\d|GX\d|C\d{4}|\d{8}_\d{6})', re.I)


def out(o):
    sys.stdout.write(json.dumps(o, default=str))
    sys.stdout.flush()


def say(*a):
    print('›', *a, file=sys.stderr, flush=True)


def load_db():
    import osxphotos
    say('reading your Photos library (a big library takes about 30 seconds)…')
    try:
        return osxphotos.PhotosDB()
    except Exception as e:
        out({'ok': False, 'error': 'cannot-read', 'detail': str(e)})
        sys.exit(2)


def since_of(cfg):
    s = cfg.get('since') or '2023-01-01'
    return datetime.fromisoformat(s).astimezone()


def candidates(db, cfg):
    since = since_of(cfg)
    media = cfg.get('media', 'videos')
    leave_people = set(cfg.get('leaveOut') or [])
    leave_labels = set(cfg.get('leaveOutLabels') or [])
    why = {'too old': 0, 'not from the camera': 0, 'screenshot or screen recording': 0, 'left out on purpose': 0}
    keep = []
    for p in db.photos(movies=True, images=(media != 'videos'), from_date=since):
        if p.hidden or p.intrash or p.shared:
            continue
        if p.date < since:
            why['too old'] += 1; continue
        if p.screenshot or getattr(p, 'screen_recording', False):
            why['screenshot or screen recording'] += 1; continue
        if not RAW.match(p.original_filename or ''):
            why['not from the camera'] += 1; continue
        if leave_people & set(p.persons) or leave_labels & set(p.labels):
            why['left out on purpose'] += 1; continue
        keep.append(p)
    return keep, why


def front(p):
    lens = (p.exif_info.lens_model if p.exif_info else '') or ''
    return bool(p.selfie or 'front' in lens.lower())


def matches(p, b, me):
    people = [x for x in p.persons if x != '_UNKNOWN_']
    face = b.get('face', 'any')
    if me and face in ('me', 'only-me') and me not in p.persons:
        return False
    if me and face == 'only-me' and (len(people) != 1 or p.persons.count('_UNKNOWN_') > 0):
        return False
    if face == 'others' and not [x for x in p.persons if x != me]:
        return False
    if b.get('noSelfie') and front(p):  # front-camera takes are talking to camera, not b-roll
        return False
    labels = set(b.get('labels') or [])
    return bool(labels & set(p.labels)) if labels else False


def thumb(p):
    ds = [d for d in (p.path_derivatives or []) if os.path.exists(d)]
    return ds[0] if ds else None


def item(p, b=None):
    ex = p.exif_info
    return {
        'id': p.uuid, 'name': p.original_filename, 'date': p.date.isoformat(), 'video': p.ismovie,
        'seconds': round(ex.duration, 1) if ex and ex.duration else None,
        'local': bool(p.path and os.path.exists(p.path)), 'thumb': thumb(p),
        'caption': getattr(p, 'ai_caption', None), 'labels': p.labels[:8], 'bucket': b,
    }


def sorted_buckets(db, cfg):
    keep, why = candidates(db, cfg)
    me = cfg.get('me')
    res = {}
    for b in cfg['buckets']:
        if b.get('album') and b.get('adopt'):
            ps = db.photos(albums=[b['album']])
        else:
            ps = [p for p in keep if matches(p, b, me)]
        ps.sort(key=lambda p: p.date, reverse=True)
        res[b['id']] = ps
    return res, keep, why


def cmd_check():
    db = load_db()
    from collections import Counter
    people = Counter(x for p in db.photos() for x in p.persons if x != '_UNKNOWN_')
    out({'ok': True, 'items': len(db.photos()), 'people': [n for n, _ in people.most_common(12)],
         'albums': sorted({a.title for a in db.album_info if a.title})})


def cmd_scan(cfg):
    db = load_db()
    res, keep, why = sorted_buckets(db, cfg)
    seen = {}
    for bid, ps in res.items():
        for p in ps:
            seen.setdefault(p.uuid, []).append(bid)
    buckets = {}
    for bid, ps in res.items():
        buckets[bid] = {
            'count': len(ps), 'videos': sum(1 for p in ps if p.ismovie),
            'shared': sum(1 for p in ps if len(seen[p.uuid]) > 1),
            'sample': [item(p, bid) for p in ps[:24]],
        }
    out({'ok': True, 'candidates': len(keep), 'unsorted': sum(1 for p in keep if p.uuid not in seen),
         'skipped': why, 'buckets': buckets})


def cmd_build(cfg):
    if '--yes' not in sys.argv:
        out({'ok': False, 'error': 'needs-yes'}); sys.exit(3)
    db = load_db()
    res, _, _ = sorted_buckets(db, cfg)
    import photoscript
    lib = photoscript.PhotosLibrary()
    made = {}
    for b in cfg['buckets']:
        if b.get('adopt'):
            made[b['id']] = {'album': b['album'], 'added': 0, 'total': len(res[b['id']]), 'adopted': True}
            continue
        name = b['album']
        alb = lib.album(name) or lib.create_album(name)
        have = {p.uuid for p in db.photos(albums=[name])}
        todo = [p.uuid for p in res[b['id']] if p.uuid not in have]
        say(f'{name}: adding {len(todo)}')
        for i in range(0, len(todo), 200):
            alb.add([photoscript.Photo(u) for u in todo[i:i + 200]])
        made[b['id']] = {'album': name, 'added': len(todo), 'total': len(have) + len(todo)}
    out({'ok': True, 'albums': made})


def cmd_find(cfg):
    db = load_db()
    album = cfg['album']
    since = since_of(cfg) if cfg.get('since') else None
    ps = db.photos(albums=[album])
    if not ps and album not in {a.title for a in db.album_info}:
        out({'ok': False, 'error': 'no-album', 'album': album}); sys.exit(4)
    if since:
        ps = [p for p in ps if p.date >= since]
    if cfg.get('kind', 'video') == 'video':
        ps = [p for p in ps if p.ismovie]
    ps.sort(key=lambda p: p.date, reverse=True)
    out({'ok': True, 'items': [item(p, cfg.get('bucket')) for p in ps]})


def cmd_export(uuid, dest):
    import osxphotos
    from osxphotos.photoexporter import ExportOptions, PhotoExporter
    db = osxphotos.PhotosDB()
    ps = db.photos(uuid=[uuid])
    if not ps:
        out({'ok': False, 'error': 'not-found'}); sys.exit(4)
    p = ps[0]
    os.makedirs(dest, exist_ok=True)
    if p.path and os.path.exists(p.path):
        to = os.path.join(dest, p.original_filename)
        shutil.copy2(p.path, to)
        out({'ok': True, 'file': to, 'how': 'copied from this Mac'}); return
    say(f'{p.original_filename} is in iCloud, asking Photos to download it…')
    last = None
    for kit in (True, False):  # PhotoKit first, then the Photos app itself
        try:
            r = PhotoExporter(p).export(dest, options=ExportOptions(download_missing=True, use_photokit=kit, use_photos_export=True, overwrite=True))
            if r.exported:
                out({'ok': True, 'file': r.exported[0], 'how': 'downloaded from iCloud'}); return
            last = r.error or r.missing
        except Exception as e:
            last = str(e)
    out({'ok': False, 'error': 'download-failed', 'detail': str(last)}); sys.exit(5)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'check'
    if cmd == 'check':
        cmd_check()
    elif cmd == 'export':
        cmd_export(sys.argv[2], sys.argv[3])
    else:
        cfg = json.load(open(sys.argv[2]))
        {'scan': cmd_scan, 'build': cmd_build, 'find': cmd_find}[cmd](cfg)

#!/usr/bin/env python3
import subprocess, sys, json, os

os.chdir('/Users/jasonwolf/jura-defense')

# 1. Node syntax check
files = [
    'src/phaser/world/path-layer.js',
    'src/phaser/playground-scene.js',
    'src/phaser/entities/tower-sprite.js',
]

print('=== Node syntax check ===')
for f in files:
    try:
        r = subprocess.run(
            ['node', '--check', f],
            capture_output=True, text=True, timeout=10
        )
        if r.returncode == 0:
            print(f'  OK: {f} (syntax valid)')
        else:
            print(f'  FAIL: {f} (rc={r.returncode}): {r.stderr[:200]}')
    except Exception as e:
        print(f'  ERROR checking {f}: {e}')

# 2. npm run build
print('\n=== npm run build ===')
try:
    r = subprocess.run(
        ['npm', 'run', 'build'],
        capture_output=True, text=True, timeout=60
    )
    print(f'  Build rc={r.returncode}')
    if r.stdout:
        for line in r.stdout.strip().split('\n')[-25:]:
            print(f'  {line}')
    if r.stderr:
        for line in r.stderr.strip().split('\n')[-25:]:
            print(f'  {line}')
except Exception as e:
    print(f'  Build error: {e}')

# 3. Check build artifacts
print('\n=== Checking build artifacts ===')
for d in ['dist', 'public', 'build']:
    if os.path.exists(d):
        print(f'  Found: {d}/')
        try:
            artifacts = os.listdir(d)[:15]
            print(f'  Contents: {", ".join(artifacts)}')
        except:
            pass
        break
else:
    print('  No build output dir found')

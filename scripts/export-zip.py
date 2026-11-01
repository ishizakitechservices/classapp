import os
import zipfile

target_zip = 'public/assets/aistudio/classapp-audited-phase2.zip'
os.makedirs(os.path.dirname(target_zip), exist_ok=True)

include_dirs = ['src', 'tests', 'scripts', 'public']
include_files = ['index.html', 'package.json', 'tsconfig.json', 'vite.config.ts', 'metadata.json', '.env.example', '.gitignore']

with zipfile.ZipFile(target_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
    for f in include_files:
        if os.path.exists(f):
            zf.write(f, f)
            print(f"Added {f}")
    
    for d in include_dirs:
        for root, dirs, files in os.walk(d):
            for file in files:
                filepath = os.path.join(root, file)
                # Skip zip files themselves and temp files
                if filepath.endswith('.zip') or filepath.endswith('.swp'):
                    continue
                zf.write(filepath, filepath)
                print(f"Added {filepath}")

print(f"Successfully created {target_zip} ({os.path.getsize(target_zip)} bytes)")

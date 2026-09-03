# check_env_keys.py  
# Check what API keys are configured
import os
import sys

# Ensure UTF-8 output on Windows
sys.stdout.reconfigure(encoding='utf-8')

base_path = r"C:\Users\Hp\Desktop\Software\nepse app"

print("="*70)
print("API KEY CONFIGURATION CHECK")
print("="*70)

env_files = [
    ".env",
    ".env.local", 
    ".env.production",
    "proxy/.env",
    "proxy/.env.local",
]

for env_file in env_files:
    fp = os.path.join(base_path, env_file)
    if os.path.exists(fp):
        print(f"\n[FOUND]: {env_file}")
        with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key, _, val = line.partition('=')
                    # Hide sensitive values
                    sensitive = any(s in key.upper() for s in 
                                  ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'API'])
                    if sensitive:
                        display_val = val[:8] + '***' if len(val) > 8 else '***'
                        print(f"  {key} = {display_val} (hidden)")
                    else:
                        print(f"  {key} = {val}")
    else:
        print(f"\n[NOT FOUND]: {env_file}")

# Also check Render environment
print("\n" + "="*70)
print("RENDER ENVIRONMENT (from render.yaml)")
print("="*70)

render_yaml = os.path.join(base_path, "proxy/render.yaml")
if os.path.exists(render_yaml):
    with open(render_yaml, 'r', encoding='utf-8', errors='ignore') as f:
        print(f.read())
else:
    print("❌ proxy/render.yaml not found")

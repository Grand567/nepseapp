import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

base_path = r"C:\Users\Hp\Desktop\Software\nepse app"
server_path = os.path.join(base_path, "proxy/server.mjs")

try:
    with open(server_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    print(f"proxy/server.mjs - {len(content):,} chars total")
    print("="*70)
    
    # Also find the guru route
    print("\n🔍 /api/guru Route:")
    print("-"*50)
    guru_match = re.search(r'(app\.(get|post)\s*\([\'\"]/api/guru.*?(?=app\.(get|post)|$))', 
                           content, re.DOTALL)
    if guru_match:
        print(guru_match.group(0)[:3000])
    else:
        print("❌ /api/guru route NOT FOUND in server.mjs")

except Exception as e:
    print(f"Error: {e}")

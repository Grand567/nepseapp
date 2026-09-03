# find_glm_code.py
# Specifically find all GLM related code
import os
import re
import sys

# Ensure UTF-8 output on Windows
sys.stdout.reconfigure(encoding='utf-8')

base_path = r"C:\Users\Hp\Desktop\Software\nepse app"

def read_file(fp):
    try:
        with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()
    except:
        return ""

print("="*70)
print("FINDING ALL GLM/AI CODE IN PROJECT")
print("="*70)

# Keywords to search for
glm_keywords = [
    'glm', 'GLM', 'zhipu', 'Zhipu', 'ZHIPU',
    'chatglm', 'ChatGLM', 'glm-4', 'glm4',
    'bigmodel', 'BigModel',
    'ZhipuAI', 'zhipuai',
    'gemini', 'Gemini', 'GEMINI',
    'openai', 'OpenAI',
    'anthropic', 'claude',
    'AI_KEY', 'GLM_KEY', 'ZHIPU_KEY',
    'api/guru', '/guru/',
    'generateContent', 'chat.completions',
    'invoke', 'completion'
]

found_files = {}

for root, dirs, files in os.walk(base_path):
    dirs[:] = [d for d in dirs if d not in 
               ['node_modules', 'build', '.git', 'dist', 'android', '.gradle']]
    
    for filename in files:
        if not filename.endswith(('.js', '.jsx', '.ts', '.tsx', '.mjs', '.json', '.env')):
            continue
            
        filepath = os.path.join(root, filename)
        rel_path = os.path.relpath(filepath, base_path)
        content = read_file(filepath)
        
        if not content:
            continue
        
        file_matches = []
        for keyword in glm_keywords:
            if keyword in content:
                # Find line numbers
                lines = content.split('\n')
                matching_lines = []
                for i, line in enumerate(lines, 1):
                    if keyword in line:
                        matching_lines.append({
                            'line': i,
                            'content': line.strip()
                        })
                
                if matching_lines:
                    file_matches.append({
                        'keyword': keyword,
                        'lines': matching_lines[:5]  # First 5 matches
                    })
        
        if file_matches:
            found_files[rel_path] = file_matches

# Print results
if found_files:
    for filepath, matches in found_files.items():
        print(f"\n📄 FILE: {filepath}")
        print("-"*50)
        for match in matches:
            print(f"\n  🔍 Keyword: '{match['keyword']}'")
            for line_info in match['lines']:
                print(f"     Line {line_info['line']:4d}: {line_info['content'][:100]}")
else:
    print("\n❌ No GLM/AI code found in project")

print("\n" + "="*70)
print("SUMMARY")
print("="*70)
print(f"Files with AI/GLM code: {len(found_files)}")
for f in found_files.keys():
    print(f"  📄 {f}")

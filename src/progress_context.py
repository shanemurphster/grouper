from pathlib import Path
path = Path(r"C:\Users\shane\OneDrive\Code\Grouper\GroupProjectAI\app\project\[id].tsx")
lines = path.read_text(encoding='utf-8').splitlines()
for i, line in enumerate(lines, start=1):
    if 'Progress bar' in line:
        print('progress line', i, repr(line))
        for j in range(max(0, i-5), i+5):
            if 0 <= j < len(lines):
                print(j+1, repr(lines[j]))
        break

from pathlib import Path
path = Path(r"C:\Users\shane\OneDrive\Code\Grouper\GroupProjectAI\app\project\[id].tsx")
with open(path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f, start=1):
        if "Project title + meta" in line:
            print(i, repr(line))
            break

from pathlib import Path
path = Path(r"C:\Users\shane\OneDrive\Code\Grouper\GroupProjectAI\app\project\[id].tsx")
with open(path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f, start=1):
        if 'Progress bar' in line:
            print(i, repr(line))
            for j in range(i-5, i+5):
                f.seek(0)
                print('line', j, repr(open(path, 'r', encoding='utf-8').read().splitlines()[j-1]))
            break

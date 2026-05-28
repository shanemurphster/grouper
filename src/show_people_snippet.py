from pathlib import Path
path = Path(r"C:\Users\shane\OneDrive\Code\Grouper\GroupProjectAI\app\project\[id].tsx")
data = path.read_text(encoding='utf-8')
idx = data.index('People')
print(data[idx-60:idx+150])

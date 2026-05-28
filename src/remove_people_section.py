from pathlib import Path
path = Path(r"C:\Users\shane\OneDrive\Code\Grouper\GroupProjectAI\app\project\[id].tsx")
data = path.read_text(encoding='utf-8')
start = data.index('\t\t\t\t\t{/* People */}\n')
end = data.index('\t\t\t\t\t</View>\n', start)
end = data.index('\t\t\t\t\t</View>\n', end + 1) + len('\t\t\t\t\t</View>\n')
data = data[:start] + data[end:]
path.write_text(data, encoding='utf-8')

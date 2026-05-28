from pathlib import Path
path = Path(r"C:\Users\shane\OneDrive\Code\Grouper\GroupProjectAI\app\project\[id].tsx")
lines = path.read_text(encoding='utf-8').splitlines()
insert_after = None
for i, line in enumerate(lines):
    if line.strip() == '</View>':
        next_line = lines[i + 1] if i + 1 < len(lines) else ''
        if 'Progress bar' in next_line:
            insert_after = i
            break
if insert_after is None:
    raise SystemExit('insert location not found')
block = [
    '\t\t\t\t\t{(peopleSectionForDesktop || peopleSectionForMobile) ? (',
    '\t\t\t\t\t\tisWide ? (',
    '\t\t\t\t\t\t\t<View style={{ flexDirection: \"row\", gap: 12, alignItems: \"flex-start\", marginTop: 12 }}>',
    '\t\t\t\t\t\t\t\t<View style={{ flex: 1 }} />',
    '\t\t\t\t\t\t\t\t<View style={{ flex: 1 }}>',
    '\t\t\t\t\t\t\t\t\t{peopleSectionForDesktop}',
    '\t\t\t\t\t\t\t\t</View>',
    '\t\t\t\t\t\t\t</View>',
    '\t\t\t\t\t\t) : (',
    '\t\t\t\t\t\t\tpeopleSectionForMobile',
    '\t\t\t\t\t\t)',
    '\t\t\t\t\t) : null}',
]
lines[insert_after + 1:insert_after + 1] = block
path.write_text("\n".join(lines) + "\n", encoding='utf-8')
for i in range(insert_after, insert_after + len(block) + 3):
    print(i + 1, lines[i])

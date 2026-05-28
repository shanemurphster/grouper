from pathlib import Path
path = Path(r"C:\Users\shane\OneDrive\Code\Grouper\GroupProjectAI\app\project\[id].tsx")
lines = path.read_text(encoding='utf-8').splitlines()
# lines are 0-indexed; the closing </View> is at index where line == '\t\t\t\t\t</View>' before progress comment
insert_after = None
for i, line in enumerate(lines):
    if line.strip() == '</View>' and i + 1 < len(lines) and 'Projection bar' not in lines[i + 1]:
        # naive approach: find the blank line before progress comment
        if any('Progress bar' in lines[j] for j in range(i, i + 5)):
            insert_after = i
            break
if insert_after is None:
    # fallback: insert after the last closing </View> before progress comment
    insert_after = next(i for i, line in enumerate(lines) if 'Progress bar' in line) - 2
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
print('inserted after line', insert_after + 1)

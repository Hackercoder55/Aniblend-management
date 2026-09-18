import os

path = r'app/manager/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace texts
content = content.replace('₹5000/minute', '₹4000/minute')
content = content.replace('?5000/minute', '?4000/minute')
content = content.replace('5000 / 60', '4000 / 60')

# Old formula: isA ? 3000 : (p.Lighting_Artist ? 3000 : 5000)
# New formula: isA ? 2500 : (p.Lighting_Artist ? 2500 : 4000)
content = content.replace('3000 : (p.Lighting_Artist ? 3000 : 5000)', '2500 : (p.Lighting_Artist ? 2500 : 4000)')

# Fallback rate
content = content.replace("const fallbackRate = (eid || '').toUpperCase().includes('A') ? 3000 : 5000;", "const fallbackRate = (eid || '').toUpperCase().includes('L') ? 1500 : ((eid || '').toUpperCase().includes('A') ? 2500 : 4000);")

# Rate with isLighting
content = content.replace('isLighting ? 2000 : (isA ? 3000 : (p.Lighting_Artist ? 3000 : 5000))', 'isLighting ? 1500 : (isA ? 2500 : (p.Lighting_Artist ? 2500 : 4000))')

# Other occurrences
content = content.replace('rate = 2000 / 60', 'rate = 1500 / 60')
content = content.replace('(sec / 60) * 2000', '(sec / 60) * 1500')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Replaced')

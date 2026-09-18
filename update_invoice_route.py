import os
import re

path = r'app/api/discord/send-invoice/route.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace unconditional TDS push
old_push = """fields.push(
      { name: '💰 TDS Deducted', value: `₹${tds.toLocaleString()}`, inline: true },
      { name: '💵 Net Payable', value: `**₹${net.toLocaleString()}**`, inline: true },
    );"""

new_push = """if (tds > 0) {
      fields.push({ name: '💰 TDS Deducted', value: `₹${tds.toLocaleString()}`, inline: true });
    }
    fields.push(
      { name: '💵 Net Payable', value: `**₹${net.toLocaleString()}**`, inline: true },
    );"""

content = content.replace(old_push, new_push)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated route.ts")

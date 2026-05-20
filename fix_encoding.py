
import re

filepath = r'd:\Docs\TFA Dashboard\tfa-dashboard\app\manager\page.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Move Dark mode toggle from sidebar to top bar
sidebar_toggle = r"""        {/* Dark Mode Toggle */}
        <button onClick={toggleDarkMode}
          className="w-full py-2 mb-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all border"
          style={{
            backgroundColor: darkMode ? '#1e1b4b' : '#f8fafc',
            color: darkMode ? '#a5b4fc' : '#64748b',
            borderColor: darkMode ? '#4338ca' : '#e2e8f0',
          }}>
          {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>"""
        
# Try to find exactly or approximately the toggle in SidebarContent
if "Dark Mode Toggle" in content:
    content = re.sub(r'\s*\{\/\*\s*Dark Mode Toggle\s*\*\/\}[\s\S]*?<\/button>', '', content)

topbar_target = r"""            <div>
              <h1 className="font-bold text-gray-800">{TABS.find(t => t.id === activeTab)?.label}</h1>
              <p className="text-xs text-gray-400">{formatDate()}</p>
            </div>
          </div>"""
          
topbar_replacement = topbar_target + r"""
          <div className="flex items-center gap-2">
            <button onClick={toggleDarkMode}
              className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all border shadow-sm"
              style={{
                backgroundColor: darkMode ? '#1e1b4b' : '#f8fafc',
                color: darkMode ? '#a5b4fc' : '#64748b',
                borderColor: darkMode ? '#4338ca' : '#e2e8f0',
              }}>
              {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
            </button>"""

if topbar_target in content:
    content = content.replace(topbar_target, topbar_replacement)

# 2. Fix corrupted emojis (they might be causing the application error in TeamTab / AnimatorModal)
# Regex to match any corrupted emoji (like 'dY' followed by garbage, or just non-ascii in JSX text where we expect ascii)
# We can just manually fix the tierStyles
content = re.sub(r"'Tier 1': \{ bg: '#dcfce7', text: '#15803d', emoji: '.*?' \}", "'Tier 1': { bg: '#dcfce7', text: '#15803d', emoji: 'Top' }", content)
content = re.sub(r"'Tier 2': \{ bg: '#dbeafe', text: '#1d4ed8', emoji: '.*?' \}", "'Tier 2': { bg: '#dbeafe', text: '#1d4ed8', emoji: 'Mid' }", content)
content = re.sub(r"'Tier 3': \{ bg: '#fef9c3', text: '#854d0e', emoji: '.*?' \}", "'Tier 3': { bg: '#fef9c3', text: '#854d0e', emoji: 'Low' }", content)
content = re.sub(r"'Concerning': \{ bg: '#fee2e2', text: '#b91c1c', emoji: '.*?' \}", "'Concerning': { bg: '#fee2e2', text: '#b91c1c', emoji: 'Warn' }", content)
content = re.sub(r"'Watchlist': \{ bg: '#ffedd5', text: '#c2410c', emoji: '.*?' \}", "'Watchlist': { bg: '#ffedd5', text: '#c2410c', emoji: 'Look' }", content)
content = re.sub(r"'Animator': \{ bg: '#f3e8ff', text: '#7e22ce', emoji: '.*?' \}", "'Animator': { bg: '#f3e8ff', text: '#7e22ce', emoji: 'Anim' }", content)
content = re.sub(r"'Lighting': \{ bg: '#cffafe', text: '#0e7490', emoji: '.*?' \}", "'Lighting': { bg: '#cffafe', text: '#0e7490', emoji: 'Light' }", content)
content = re.sub(r"'Normal Workspace': \{ bg: '#f1f5f9', text: '#64748b', emoji: '.*?' \}", "'Normal Workspace': { bg: '#f1f5f9', text: '#64748b', emoji: 'Base' }", content)

# Fix invoice month label emoji
content = re.sub(r'dY"\.\s*\{inv\.month_label', '{inv.month_label', content)
# Fix New! emoji
content = re.sub(r'o"\s*New!', 'New!', content)
# Fix Head/Manager emoji in notes
content = re.sub(r"entry\.role === 'head' \? '.*? Head' : '.*? Manager'", "entry.role === 'head' ? 'Head' : 'Manager'", content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("done")

import os
import re

path = r'app/manager/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add state
content = content.replace("const [tdsPercents, setTdsPercents] = useState<Record<string, string>>({})", "const [tdsPercents, setTdsPercents] = useState<Record<string, string>>({})\n    const [isTdsEnabled, setIsTdsEnabled] = useState(true)")

# Apply toggle logic
content = content.replace("const tdsPct = parseFloat(tdsPercents[eid] || '10') || 10", "const tdsPct = isTdsEnabled ? (parseFloat(tdsPercents[eid] || '10') || 10) : 0")

# Add toggle to UI
old_ui = """<div className="flex flex-wrap items-center gap-3">
            <button onClick={handleSendInvoices} disabled={sendingInvoices}"""
new_ui = """<div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm mr-2">
              <span className="text-sm font-medium text-gray-700">Apply TDS</span>
              <input type="checkbox" checked={isTdsEnabled} onChange={e => setIsTdsEnabled(e.target.checked)} className="form-checkbox h-4 w-4 text-indigo-600 transition duration-150 ease-in-out cursor-pointer" />
            </label>
            <button onClick={handleSendInvoices} disabled={sendingInvoices}"""
content = content.replace(old_ui, new_ui)

# Hide header column
content = content.replace('<th className="px-4 py-3 text-right">TDS %</th>', '{isTdsEnabled && <th className="px-4 py-3 text-right">TDS %</th>}')

# Hide row column
old_td = """value={tdsPercents[r.animator.Employee_ID] ?? '10'}
                            onChange={e => setTdsPercents(prev => ({ ...prev, [r.animator.Employee_ID]: e.target.value }))}
                            className="w-14 px-1 py-1 border border-red-300 rounded text-sm focus:outline-none font-mono focus:border-red-500 transition-colors text-right bg-red-50"
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600">"""

new_td = """value={tdsPercents[r.animator.Employee_ID] ?? '10'}
                            onChange={e => setTdsPercents(prev => ({ ...prev, [r.animator.Employee_ID]: e.target.value }))}
                            className="w-14 px-1 py-1 border border-red-300 rounded text-sm focus:outline-none font-mono focus:border-red-500 transition-colors text-right bg-red-50"
                          />
                        </td>
                        )}
                        <td className="px-4 py-3 text-right font-bold text-emerald-600">"""
# Wait, I need to open the {isTdsEnabled && ( before the td
old_td_start = """<td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min="0"
                            placeholder="10"
                            value={tdsPercents[r.animator.Employee_ID] ?? '10'}"""
new_td_start = """{isTdsEnabled && (
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min="0"
                            placeholder="10"
                            value={tdsPercents[r.animator.Employee_ID] ?? '10'}"""

content = content.replace(old_td_start, new_td_start)
content = content.replace(old_td, new_td)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated page.tsx")

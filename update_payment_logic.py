import re

with open(r'd:\Docs\TFA Dashboard\tfa-dashboard\app\manager\page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update PayoutCalculatorTab gross logic
old_calc = '''      animatorProjectsForCalc.forEach(p => {
        const projSec = parseDurationSec(p.Duration || '', p.Project_ID)
        const projMins = projSec / 60
        const isLighting = p.Lighting_Artist && p.Lighting_Artist.toLowerCase() === animName.toLowerCase()
        const isAnim = p.Employee_ID === eid || (animName && (p.Animator || '').split(',').map(s => s.trim().toLowerCase()).includes(animName.toLowerCase()))
        const isLead = p.Lead && p.Lead.toLowerCase() === animName.toLowerCase()
        if (isLead) leadBonus += 1000
        if (isLighting) {
          calculatedGross += projMins * 2000
        } else if (isAnim) {
          const rate = p.Lighting_Artist ? 3000 : 5000
          calculatedGross += projMins * rate
        }
      })
      const gross = calculatedGross > 0 ? calculatedGross : currentMins * 5000'''

new_calc = '''      animatorProjectsForCalc.forEach(p => {
        const projSec = parseDurationSec(p.Duration || '', p.Project_ID)
        const isLighting = p.Lighting_Artist && p.Lighting_Artist.toLowerCase() === animName.toLowerCase()
        const isAnim = p.Employee_ID === eid || (animName && (p.Animator || '').split(',').map(s => s.trim().toLowerCase()).includes(animName.toLowerCase()))
        const isLead = p.Lead && p.Lead.toLowerCase() === animName.toLowerCase()
        
        if (isLead) leadBonus += 1000
        
        if (isLighting) {
          calculatedGross += projSec * (2000 / 60)
        } else if (isAnim) {
          const rate = p.Lighting_Artist ? 3000 : 5000
          calculatedGross += projSec * (rate / 60)
        }
      })
      
      // Nearest 100 round off
      let baseGross = calculatedGross > 0 ? calculatedGross : currentMins * 5000;
      const gross = Math.round(baseGross / 100) * 100;'''

if old_calc in content:
    content = content.replace(old_calc, new_calc)
    print("Updated PayoutCalculator logic")
else:
    print("Could not find PayoutCalculator logic")

# 2. Update TiersTab Modal Table Header
old_th = '''                      <th className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</th>
                      <th className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Approved Date</th>'''
new_th = '''                      <th className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</th>
                      <th className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Earnings</th>
                      <th className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Approved Date</th>'''
content = content.replace(old_th, new_th)

# 3. Update TiersTab Modal Table Row
old_tr = '''                        return (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <td className="p-3">
                              <p className="text-sm font-bold text-gray-800">{p.Project_ID}</p>
                              <p className="text-xs text-gray-500 truncate max-w-[200px]" title={p.Project_title}>{p.Project_title || '—'}</p>
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${badgeColor}`}>
                                {p.Status}
                              </span>
                            </td>
                            <td className="p-3 text-sm font-semibold text-gray-700">{p.Duration || '—'}</td>
                            <td className="p-3 text-xs text-gray-500 hidden sm:table-cell">{p.Approved_Date || p['Date Approved'] || '—'}</td>
                          </tr>
                        )'''

new_tr = '''                        // Calculate specific project earnings for this animator
                        let projEarn = 0;
                        if (isApproved) {
                           const projSec = parseDurationSec(p.Duration || '', p.Project_ID);
                           const animName = selectedAnimatorForModal.Name;
                           const eid = selectedAnimatorForModal.Employee_ID;
                           const isLighting = p.Lighting_Artist && p.Lighting_Artist.toLowerCase() === animName.toLowerCase();
                           const isAnim = p.Employee_ID === eid || (animName && (p.Animator || '').split(',').map(s => s.trim().toLowerCase()).includes(animName.toLowerCase()));
                           const isLead = p.Lead && p.Lead.toLowerCase() === animName.toLowerCase();
                           
                           if (isLead) projEarn += 1000;
                           if (isLighting) {
                              projEarn += projSec * (2000 / 60);
                           } else if (isAnim) {
                              const rate = p.Lighting_Artist ? 3000 : 5000;
                              projEarn += projSec * (rate / 60);
                           }
                           projEarn = Math.round(projEarn / 100) * 100;
                        }

                        return (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <td className="p-3">
                              <p className="text-sm font-bold text-gray-800">{p.Project_ID}</p>
                              <p className="text-xs text-gray-500 truncate max-w-[200px]" title={p.Project_title}>{p.Project_title || '—'}</p>
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${badgeColor}`}>
                                {p.Status}
                              </span>
                            </td>
                            <td className="p-3 text-sm font-semibold text-gray-700">{p.Duration || '—'}</td>
                            <td className="p-3 text-sm font-bold text-emerald-600">{isApproved && projEarn > 0 ? `₹${projEarn.toLocaleString()}` : '—'}</td>
                            <td className="p-3 text-xs text-gray-500 hidden sm:table-cell">{p.Approved_Date || p['Date Approved'] || '—'}</td>
                          </tr>
                        )'''
if old_tr in content:
    content = content.replace(old_tr, new_tr)
    print("Updated TiersTab Modal")
else:
    print("Could not find TiersTab Modal Row")

with open(r'd:\Docs\TFA Dashboard\tfa-dashboard\app\manager\page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

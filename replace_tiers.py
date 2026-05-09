import re

with open('d:/Docs/TFA Dashboard/tfa-dashboard/app/manager/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# We need to find `function TiersTab(...) {` and replace it up to the `export default function ManagerDashboard()`

new_code = """function TiersTab({ animators, projects, onRefresh }: { animators: Animator[]; projects: Project[]; onRefresh: () => void }) {
  const [pendingTiers, setPendingTiers] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [activeTier, setActiveTier] = useState<string | null>(null)
  
  // Daily Output Calculation (Approved based)
  const last7Days = React.useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      days.push(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))
    }
    return days
  }, [])

  const getAnimatorOutput = useCallback((a: Animator) => {
    const outputMap: Record<string, number> = {}
    last7Days.forEach(d => outputMap[d] = 0)
    
    projects.forEach(p => {
      const isMatched = p.Employee_ID === a.Employee_ID || 
                        (p.Animator || '').toLowerCase().includes(a.Name.toLowerCase()) || 
                        (p.Animator || '').toLowerCase().includes(a.Employee_ID.toLowerCase());
      
      if (isMatched && ['Approved', 'Paid', 'Closed'].includes(p.Status)) {
        const appDateStr = p['Date Approved'] || p.Approved_Date
        if (appDateStr) {
          try {
            const pDate = parseDate(appDateStr).getTime()
            const matchDay = last7Days.find(d => parseDate(d).getTime() === pDate)
            if (matchDay) {
              // using parseDurationSec from module scope
              outputMap[matchDay] += parseDurationSec(p.Duration || '', p.Project_ID)
            }
          } catch(e) {}
        }
      }
    })
    
    return last7Days.map(d => ({
      name: d.slice(0, 6),
      minutes: Math.round(outputMap[d] / 60)
    }))
  }, [projects, last7Days])

  const groupedAnimators = React.useMemo(() => {
    const groups: Record<string, Animator[]> = {}
    TIER_CATEGORIES.forEach(t => groups[t] = [])
    
    animators.forEach(a => {
      let tier = a.Role || 'Normal Workspace'
      if (!TIER_CATEGORIES.includes(tier)) tier = 'Normal Workspace'
      if (pendingTiers[a.Employee_ID]) tier = pendingTiers[a.Employee_ID]
      
      if (!groups[tier]) groups[tier] = []
      groups[tier].push(a)
    })
    return groups
  }, [animators, pendingTiers])

  const handleTierChange = (empId: string, newTier: string) => {
    setPendingTiers(prev => ({ ...prev, [empId]: newTier }))
  }

  const handleSaveAll = async () => {
    const edits = Object.entries(pendingTiers)
    if (edits.length === 0) return
    setSaving(true)
    
    try {
      await Promise.all(edits.map(async ([empId, tier]) => {
        await apiClient.from('animators').update({ Role: tier }).eq('Employee_ID', empId)
      }))
      setPendingTiers({})
      onRefresh()
    } catch (err) {
      console.error(err)
      alert("Error saving tiers.")
    } finally {
      setSaving(false)
    }
  }

  if (!activeTier) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-100 p-5 gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Animator Tiers</h2>
            <p className="text-sm text-gray-500 mt-1">Select a tier to view and manage its animators.</p>
          </div>
          {Object.keys(pendingTiers).length > 0 && (
             <button 
                onClick={handleSaveAll} 
                disabled={saving}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 whitespace-nowrap"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
             >
               {saving ? 'Saving...' : `Save ${Object.keys(pendingTiers).length} Changes`}
             </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {TIER_CATEGORIES.map(tier => {
            const count = groupedAnimators[tier].length
            return (
              <div 
                key={tier} 
                onClick={() => setActiveTier(tier)} 
                className="cursor-pointer bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-indigo-300 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 bg-indigo-50 text-indigo-500 group-hover:scale-110 transition-transform">
                  {tier.includes('1') ? '🥇' : tier.includes('2') ? '🥈' : tier.includes('3') ? '🥉' : tier === 'Concerning' ? '⚠️' : tier === 'Watchlist' ? '👀' : tier === 'Lighting' ? '💡' : '🎨'}
                </div>
                <h3 className="text-xl font-bold text-gray-800">{tier}</h3>
                <p className="text-sm text-gray-500 mt-1 font-medium">{count} Animators</p>
                <div className="mt-4 text-xs font-semibold text-indigo-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  View Animators <span className="text-lg">→</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const group = groupedAnimators[activeTier]

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-20 z-10 gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setActiveTier(null)}
            className="w-10 h-10 rounded-full bg-gray-50 hover:bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-600 transition-colors"
          >
            ←
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-800">{activeTier} <span className="text-sm font-normal text-gray-500 ml-2">({group.length} Animators)</span></h2>
            <p className="text-sm text-gray-500 mt-1">Bulk edit tiers and track approved daily output.</p>
          </div>
        </div>
        <button 
          onClick={handleSaveAll} 
          disabled={saving || Object.keys(pendingTiers).length === 0}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 whitespace-nowrap"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
        >
          {saving ? 'Saving...' : `Save ${Object.keys(pendingTiers).length} Changes`}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {group.length === 0 ? (
          <div className="col-span-full text-center py-16 bg-white rounded-2xl border border-gray-100">
            <p className="text-gray-400">No animators currently in {activeTier}.</p>
          </div>
        ) : (
          group.map((a, idx) => {
            const chartData = getAnimatorOutput(a)
            const isEdited = !!pendingTiers[a.Employee_ID]
            
            return (
              <div key={idx} className={`bg-white rounded-xl border p-5 shadow-sm transition-all hover:shadow-md ${isEdited ? 'border-indigo-400 ring-2 ring-indigo-100 bg-indigo-50/20' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold text-white flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                      {(a.Name || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-gray-800 text-sm truncate" title={a.Name}>{a.Name}</h4>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{a.Employee_ID}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Load</p>
                    <p className="text-sm font-bold text-gray-800">{a['Current video'] || 0}</p>
                  </div>
                </div>
                
                <div className="mb-5">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Tier Assignment</label>
                  <select 
                    className={`w-full text-sm font-semibold rounded-lg px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${isEdited ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                    value={activeTier}
                    onChange={(e) => handleTierChange(a.Employee_ID, e.target.value)}
                  >
                    {TIER_CATEGORIES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="bg-gray-50/80 rounded-xl p-3 border border-gray-100">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Approved Output</p>
                    <p className="text-[10px] text-gray-400 font-medium">Last 7 Days (Mins)</p>
                  </div>
                  <div className="h-20 w-full mt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          formatter={(value: any) => [`${value} mins`, 'Output']}
                          labelStyle={{ color: '#6b7280', marginBottom: '2px' }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="minutes" 
                          stroke="#667eea" 
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: '#667eea', strokeWidth: 0 }}
                          activeDot={{ r: 5, fill: '#7e22ce' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-between mt-1 px-1">
                    <span className="text-[9px] text-gray-400 font-medium">{last7Days[0].slice(0, 6)}</span>
                    <span className="text-[9px] text-gray-400 font-medium">{last7Days[last7Days.length-1].slice(0, 6)}</span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
"""

# Regex substitution
pattern = re.compile(r'function TiersTab\(\{.*?\}\)\s*\{.*?(?=export default function ManagerDashboard\(\))', re.DOTALL)
new_content = pattern.sub(new_code + '\n', content)

with open('d:/Docs/TFA Dashboard/tfa-dashboard/app/manager/page.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)
    
print("Successfully replaced TiersTab")

const fs = require('fs')

let content = fs.readFileSync('d:/Docs/TFA Dashboard/tfa-dashboard/app/manager/page.tsx', 'utf-8')

const tiersReplacement = `function TiersTab({ animators, projects, onRefresh }: { animators: Animator[]; projects: Project[]; onRefresh: () => void }) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loadingPayments, setLoadingPayments] = useState(true)
  const [pendingTiers, setPendingTiers] = useState<Record<string, string>>({})
  const [pendingTotalEarnings, setPendingTotalEarnings] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [activeTier, setActiveTier] = useState<string | null>(null)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<'Name' | 'EmpID' | 'Load'>('Name')

  // Month options (like PayoutCalculator)
  const monthOptions = React.useMemo(() => {
    const opts: string[] = ['Last 7 Days']
    const now = new Date()
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      opts.push(d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }))
    }
    return opts
  }, [])
  const [selectedMonth, setSelectedMonth] = useState<string>('Last 7 Days')

  useEffect(() => {
    apiClient.from('payments').select('*').then(({ data }) => {
      setPayments(data || [])
      setLoadingPayments(false)
    })
  }, [])

  // Days mapping based on selected month
  const chartDays = React.useMemo(() => {
    const days = []
    if (selectedMonth === 'Last 7 Days') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        days.push(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))
      }
    } else {
      // Month format is "Apr 2026"
      const d = new Date(\`\${selectedMonth} 1\`)
      const month = d.getMonth()
      const year = d.getFullYear()
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(year, month, i)
        days.push(date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))
      }
    }
    return days
  }, [selectedMonth])

  const getAnimatorOutput = useCallback((a: Animator) => {
    const outputMap: Record<string, number> = {}
    chartDays.forEach(d => outputMap[d] = 0)
    
    projects.forEach(p => {
      const isMatched = p.Employee_ID === a.Employee_ID || 
                        (p.Animator || '').toLowerCase().includes(a.Name.toLowerCase()) || 
                        (p.Animator || '').toLowerCase().includes(a.Employee_ID.toLowerCase());
      
      if (isMatched && ['Approved', 'Paid', 'Closed'].includes(p.Status)) {
        const appDateStr = p['Date Approved'] || p.Approved_Date
        if (appDateStr) {
          try {
            const pDate = parseDate(appDateStr).getTime()
            const matchDay = chartDays.find(d => parseDate(d).getTime() === pDate)
            if (matchDay) {
              outputMap[matchDay] += parseDurationSec(p.Duration || '', p.Project_ID)
            }
          } catch(e) {}
        }
      }
    })
    
    return chartDays.map(d => ({
      name: d.slice(0, 6),
      minutes: Math.round(outputMap[d] / 60)
    }))
  }, [projects, chartDays])

  // Get Monthly Net Earned from payments table for this animator and selectedMonth
  const getMonthlyEarned = useCallback((empId: string) => {
    if (selectedMonth === 'Last 7 Days') return null
    // Payment entries have 'Project ID' === \`Month: \${selectedMonth}\`
    const payment = payments.find(p => p['Employee ID'] === empId && p['Project ID'] === \`Month: \${selectedMonth}\`)
    return payment?.net_paid || 0
  }, [payments, selectedMonth])

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

    // Sort and Filter logic within the active group
    Object.keys(groups).forEach(k => {
      groups[k] = groups[k].filter(a => {
        if (!searchQuery) return true
        return a.Name.toLowerCase().includes(searchQuery.toLowerCase()) || a.Employee_ID.toLowerCase().includes(searchQuery.toLowerCase())
      }).sort((a, b) => {
        if (sortMode === 'Name') return a.Name.localeCompare(b.Name)
        if (sortMode === 'EmpID') return a.Employee_ID.localeCompare(b.Employee_ID)
        if (sortMode === 'Load') return (b['Current video'] || 0) - (a['Current video'] || 0)
        return 0
      })
    })

    return groups
  }, [animators, pendingTiers, searchQuery, sortMode])

  const handleTierChange = (empId: string, newTier: string) => {
    setPendingTiers(prev => ({ ...prev, [empId]: newTier }))
  }

  const handleSaveAll = async () => {
    const tierEdits = Object.entries(pendingTiers)
    const earningsEdits = Object.entries(pendingTotalEarnings)
    if (tierEdits.length === 0 && earningsEdits.length === 0) return
    setSaving(true)
    
    try {
      // Create a set of all empIds that have edits
      const allEmpIds = new Set([...tierEdits.map(e => e[0]), ...earningsEdits.map(e => e[0])])
      
      await Promise.all(Array.from(allEmpIds).map(async (empId) => {
        const payload: any = {}
        if (pendingTiers[empId]) payload['Role'] = pendingTiers[empId]
        if (pendingTotalEarnings[empId] !== undefined) payload['total_earnings'] = Number(pendingTotalEarnings[empId])
        await apiClient.from('animators').update(payload).eq('Employee_ID', empId)
      }))
      
      setPendingTiers({})
      setPendingTotalEarnings({})
      onRefresh()
    } catch (err) {
      console.error(err)
      alert("Error saving changes.")
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
          {(Object.keys(pendingTiers).length > 0 || Object.keys(pendingTotalEarnings).length > 0) && (
             <button 
                onClick={handleSaveAll} 
                disabled={saving}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 whitespace-nowrap"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
             >
               {saving ? 'Saving...' : \`Save \${Object.keys(pendingTiers).length + Object.keys(pendingTotalEarnings).length} Changes\`}
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
      {/* Sticky Header with Filters */}
      <div className="flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 sticky top-20 z-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-5 border-b border-gray-100 gap-4">
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
            disabled={saving || (Object.keys(pendingTiers).length === 0 && Object.keys(pendingTotalEarnings).length === 0)}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
          >
            {saving ? 'Saving...' : \`Save \${Object.keys(pendingTiers).length + Object.keys(pendingTotalEarnings).length} Changes\`}
          </button>
        </div>
        
        <div className="p-4 flex flex-col md:flex-row items-center gap-4 bg-gray-50/50 rounded-b-2xl">
          <input 
            type="text" 
            placeholder="Search by Name or EmpID..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-64 px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select 
            value={sortMode}
            onChange={(e: any) => setSortMode(e.target.value)}
            className="w-full md:w-40 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="Name">Sort by Name</option>
            <option value="EmpID">Sort by EmpID</option>
            <option value="Load">Sort by Load</option>
          </select>
          <div className="hidden md:block w-px h-8 bg-gray-200 mx-2"></div>
          <select 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full md:w-48 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-semibold text-indigo-700"
          >
            {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {group.length === 0 ? (
          <div className="col-span-full text-center py-16 bg-white rounded-2xl border border-gray-100">
            <p className="text-gray-400">No animators match your criteria.</p>
          </div>
        ) : (
          group.map((a, idx) => {
            const chartData = getAnimatorOutput(a)
            const isTierEdited = !!pendingTiers[a.Employee_ID]
            const isEarningEdited = pendingTotalEarnings[a.Employee_ID] !== undefined
            const isEdited = isTierEdited || isEarningEdited
            
            const monthlyEarned = getMonthlyEarned(a.Employee_ID)
            
            return (
              <div key={a.Employee_ID} className={\`bg-white rounded-xl border p-5 shadow-sm transition-all hover:shadow-md \${isEdited ? 'border-indigo-400 ring-2 ring-indigo-100 bg-indigo-50/10' : 'border-gray-200'}\`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold text-white flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                      {(a.Name || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-gray-800 text-sm truncate" title={a.Name}>{a.Name}</h4>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{a.Employee_ID}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Load</p>
                    <p className="text-sm font-bold text-gray-800">{a['Current video'] || 0}</p>
                  </div>
                </div>

                {a['Phone Number'] && (
                  <div className="mb-3 flex items-center gap-2 text-xs text-gray-600 bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100">
                    <span>📞</span> <span className="font-mono">{a['Phone Number']}</span>
                  </div>
                )}
                
                <div className="mb-4">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Tier Assignment</label>
                  <select 
                    className={\`w-full text-sm font-semibold rounded-lg px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors \${isTierEdited ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}\`}
                    value={activeTier}
                    onChange={(e) => handleTierChange(a.Employee_ID, e.target.value)}
                  >
                    {TIER_CATEGORIES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Earnings Section */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-emerald-50/50 rounded-lg p-2 border border-emerald-100">
                    <label className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider mb-1 block">Total Earned</label>
                    <div className="flex items-center">
                      <span className="text-emerald-700 font-bold mr-1">₹</span>
                      <input 
                        type="number"
                        className={\`w-full bg-transparent text-sm font-bold focus:outline-none text-emerald-800 \${isEarningEdited ? 'border-b-2 border-emerald-400' : ''}\`}
                        value={isEarningEdited ? pendingTotalEarnings[a.Employee_ID] : (a.total_earnings || 0)}
                        onChange={(e) => setPendingTotalEarnings(prev => ({ ...prev, [a.Employee_ID]: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="bg-blue-50/50 rounded-lg p-2 border border-blue-100">
                    <label className="text-[9px] font-bold text-blue-600 uppercase tracking-wider mb-1 block truncate">
                      {selectedMonth === 'Last 7 Days' ? 'Monthly' : selectedMonth.split(' ')[0]} Earned
                    </label>
                    <div className="flex items-center">
                      <span className="text-blue-700 font-bold mr-1">₹</span>
                      <span className="text-sm font-bold text-blue-800">{monthlyEarned !== null ? monthlyEarned.toLocaleString() : '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50/80 rounded-xl p-3 border border-gray-100">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Approved Output</p>
                    <p className="text-[10px] text-gray-400 font-medium">Mins</p>
                  </div>
                  <div className="h-20 w-full mt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          formatter={(value: any) => [\`\${value} mins\`, 'Output']}
                          labelStyle={{ color: '#6b7280', marginBottom: '2px' }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="minutes" 
                          stroke="#667eea" 
                          strokeWidth={2.5}
                          dot={chartDays.length <= 7 ? { r: 3, fill: '#667eea', strokeWidth: 0 } : false}
                          activeDot={{ r: 5, fill: '#7e22ce' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-between mt-1 px-1">
                    <span className="text-[9px] text-gray-400 font-medium">{chartDays[0].slice(0, 6)}</span>
                    <span className="text-[9px] text-gray-400 font-medium">{chartDays[chartDays.length-1].slice(0, 6)}</span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}`

content = content.replace(/function TiersTab\(\{.*?\}\)\s*\{[\s\S]*?(?=export default function ManagerDashboard)/, tiersReplacement + '\n\n')

fs.writeFileSync('d:/Docs/TFA Dashboard/tfa-dashboard/app/manager/page.tsx', content)
console.log('TiersTab updated')

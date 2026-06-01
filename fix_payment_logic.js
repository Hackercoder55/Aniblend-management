const fs = require('fs');
let code = fs.readFileSync('app/manager/page.tsx', 'utf8');

const helperStr = `
function getNormalizedMonthStr(dateStr: string) {
  if (!dateStr) return 'Unknown'
  try {
    let d: Date
    if (dateStr.startsWith('Month: ')) {
      d = new Date(dateStr.replace('Month: ', '').trim())
    } else {
      d = new Date(dateStr)
    }
    if (!isNaN(d.getTime())) return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
  } catch {}
  return 'Unknown'
}

function calculateAnimatorNetPay(animator: Animator, projects: Project[], paymentsRaw: any[]) {
  const byMonth: Record<string, { totalGrossFromProjects: number; totalBonus: number; totalNetTable: number }> = {}

  // 1. Projects
  projects.forEach(p => {
    const isAnim = p.Employee_ID === animator.Employee_ID || (String(p.Animator || '')).toLowerCase().includes((animator.Name || '').toLowerCase())
    const isLighting = p.Lighting_Artist && p.Lighting_Artist.toLowerCase() === (animator.Name || '').toLowerCase()
    const isLead = p.Lead && p.Lead.toLowerCase() === (animator.Name || '').toLowerCase()
    if (!(isAnim || isLighting || isLead) || (p.Payment_Status !== 'Paid' && p.Status !== 'Closed')) return

    let amount = 0
    const sec = parseDurationSec(p.Duration || extractDuration(p.Project_ID) || '0', p.Project_ID)
    
    if (isLead && p.Payment_Status === 'Paid') {
       amount += 1000
    }
    if (isLighting || isAnim) {
       if (isLighting && p.Payment_Status === 'Paid') {
          amount += (sec / 60) * 2000
       } else if (isAnim && p.Payment_Status === 'Paid') {
          const rate = p.Lighting_Artist ? 3000 : 5000
          amount += (sec / 60) * rate
       }
    }

    const dateStr = p.client_paid_date || p.paid_date || p.Approved_Date || p['Date Approved'] || (p as any).Timestamp || ''
    const monthKey = getNormalizedMonthStr(dateStr)

    if (!byMonth[monthKey]) byMonth[monthKey] = { totalGrossFromProjects: 0, totalBonus: 0, totalNetTable: 0 }
    byMonth[monthKey].totalGrossFromProjects += amount
  })

  // 2. Payments
  paymentsRaw.forEach(pay => {
    let monthKey = 'Unknown'
    if (pay['Project ID'] && pay['Project ID'].startsWith('Month: ')) {
      monthKey = getNormalizedMonthStr(pay['Project ID'])
    } else {
      monthKey = getNormalizedMonthStr(pay.paid_date || pay.Timestamp)
    }
    
    if (!byMonth[monthKey]) byMonth[monthKey] = { totalGrossFromProjects: 0, totalBonus: 0, totalNetTable: 0 }
    byMonth[monthKey].totalBonus = Math.max(byMonth[monthKey].totalBonus, Number(pay.bonus) || 0)
    byMonth[monthKey].totalNetTable = Math.max(byMonth[monthKey].totalNetTable, Number(pay.net_paid) || 0)
  })

  // Sum
  let totalNet = 0
  Object.values(byMonth).forEach(grp => {
    if (grp.totalNetTable > 0) {
      totalNet += grp.totalNetTable
    } else {
      const g = Math.round(grp.totalGrossFromProjects / 100) * 100
      totalNet += Math.round(g - (g * 0.10) + grp.totalBonus)
    }
  })
  
  return totalNet
}
`;

if (!code.includes('function getNormalizedMonthStr')) {
  code = code.replace('// ─── Shared Types & Tools ───────────────────────────────────────────────────', '// ─── Shared Types & Tools ───────────────────────────────────────────────────\n' + helperStr);
}

// 2. Update TeamTab to fetch paymentsRaw
code = code.replace(
  `  const [paymentsData, setPaymentsData] = useState<Record<string, number>>({})

  useEffect(() => {
    let mounted = true
    apiClient.from('payments').select('"Employee ID", bonus').not('bonus', 'is', null)
      .then((res: any) => {
        if (!mounted || !res.data) return
        const acc: Record<string, number> = {}
        res.data.forEach((p: any) => {
          if (p['Employee ID']) acc[p['Employee ID']] = (acc[p['Employee ID']] || 0) + (Number(p.bonus) || 0)
        })
        setPaymentsData(acc)
      })
    return () => { mounted = false }
  }, [])`,
  `  const [paymentsRaw, setPaymentsRaw] = useState<any[]>([])

  useEffect(() => {
    let mounted = true
    apiClient.from('payments').select('*')
      .then((res: any) => {
        if (!mounted || !res.data) return
        setPaymentsRaw(res.data)
      })
    return () => { mounted = false }
  }, [])`
);

// 3. Update TeamTab netPay calculation
const oldNetPayCalc = `          // Payment Calculation
          let grossPay = 0
          projects
            .filter(p => (p.Employee_ID === a.Employee_ID || (String(p.Animator || '')).toLowerCase().includes((a.Name || '').toLowerCase()) || (String(p.Lead || '')).toLowerCase() === (a.Name || '').toLowerCase() || (String(p.Lighting_Artist || '')).toLowerCase() === (a.Name || '').toLowerCase()) && p.Payment_Status === 'Paid')
            .forEach(p => {
               const isLead = (String(p.Lead || '')).toLowerCase() === (a.Name || '').toLowerCase()
               const isLighting = (String(p.Lighting_Artist || '')).toLowerCase() === (a.Name || '').toLowerCase()
               const isAnim = p.Employee_ID === a.Employee_ID || (String(p.Animator || '')).toLowerCase().includes((a.Name || '').toLowerCase())
               
               if (isLead) grossPay += 1000
               if (isLighting || isAnim) {
                  const sec = parseDurationSec(p.Duration || extractDuration(p.Project_ID) || '0', p.Project_ID)
                  if (isLighting) {
                     grossPay += (sec / 60) * 2000
                  } else {
                     const rate = p.Lighting_Artist ? 3000 : 5000
                     grossPay += (sec / 60) * rate
                  }
               }
            })
          grossPay = Math.round(grossPay / 100) * 100
          
          const bonus = paymentsData[a.Employee_ID] || 0
          const totalGross = grossPay + bonus
          const tds = totalGross * 0.10
          const netPay = totalGross - tds`;

const newNetPayCalc = `          // Payment Calculation
          const animPayments = paymentsRaw.filter(p => p['Employee ID'] === a.Employee_ID)
          const netPay = calculateAnimatorNetPay(a, projects, animPayments)`;

if (code.includes(oldNetPayCalc)) {
  code = code.replace(oldNetPayCalc, newNetPayCalc);
} else {
  console.log("Could not find oldNetPayCalc block!");
}

// 4. Update PaidProjectsModal date normalization
const oldMonthKeyLogic = `      let monthKey = 'Unknown'
      if (dateStr) {
        try {
          const d = parseDate(dateStr)
          if (d.getTime() !== 0) {
            monthKey = d.toLocaleString('default', { month: 'long', year: 'numeric' })
          }
        } catch {}
      }`;
const newMonthKeyLogic = `      const monthKey = getNormalizedMonthStr(dateStr)`;
if (code.includes(oldMonthKeyLogic)) {
  code = code.replace(oldMonthKeyLogic, newMonthKeyLogic);
} else {
  console.log("Could not find oldMonthKeyLogic block!");
}

const oldPayMonthKeyLogic = `    let monthKey = 'Unknown'
    if (pay['Project ID'] && pay['Project ID'].startsWith('Month: ')) {
      monthKey = pay['Project ID'].replace('Month: ', '').trim()
    } else {
      const rawDate = pay.paid_date || pay.Timestamp
      if (rawDate) {
        try {
          const d = new Date(rawDate)
          if (!isNaN(d.getTime())) monthKey = d.toLocaleString('default', { month: 'long', year: 'numeric' })
        } catch {}
      }
    }`;
const newPayMonthKeyLogic = `    let monthKey = 'Unknown'
    if (pay['Project ID'] && pay['Project ID'].startsWith('Month: ')) {
      monthKey = getNormalizedMonthStr(pay['Project ID'])
    } else {
      monthKey = getNormalizedMonthStr(pay.paid_date || pay.Timestamp)
    }`;
if (code.includes(oldPayMonthKeyLogic)) {
  code = code.replace(oldPayMonthKeyLogic, newPayMonthKeyLogic);
} else {
  console.log("Could not find oldPayMonthKeyLogic block!");
}

fs.writeFileSync('app/manager/page.tsx', code);
console.log('Payment Logic Patched');

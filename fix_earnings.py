import re

with open('d:/Docs/TFA Dashboard/tfa-dashboard/app/manager/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_logic = '''            const chartData = getAnimatorOutput(a)
            const isTierEdited = !!pendingTiers[a.Employee_ID]
            const isEarningEdited = pendingTotalEarnings[a.Employee_ID] !== undefined
            const isEdited = isTierEdited || isEarningEdited
            
            const monthlyEarned = getMonthlyEarned(a.Employee_ID)'''

new_logic = '''            const chartData = getAnimatorOutput(a)
            const isTierEdited = !!pendingTiers[a.Employee_ID]
            const isEarningEdited = pendingTotalEarnings[a.Employee_ID] !== undefined
            const isEdited = isTierEdited || isEarningEdited
            
            const totalMinutes = chartData.reduce((acc, d) => acc + d.minutes, 0)
            const compRate = Number(a.Compensation) || 85
            const liveMonthlyEarned = Math.round(totalMinutes * compRate)
            
            const payment = selectedMonth !== 'Last 7 Days' ? payments.find(p => p['Employee ID'] === a.Employee_ID && p['Project ID'] === `Month: ${selectedMonth}`) : null
            const monthlyEarned = payment ? payment.net_paid : liveMonthlyEarned
            
            let defaultTotal = Number(a.total_earnings) || 0
            if (defaultTotal === 0) {
              defaultTotal = payments.filter(p => p['Employee ID'] === a.Employee_ID).reduce((sum, p) => sum + (Number(p.net_paid) || 0), 0)
              if (!payment || selectedMonth === 'Last 7 Days') {
                 defaultTotal += liveMonthlyEarned
              }
            }'''

content = content.replace(old_logic, new_logic)

content = content.replace(
    'value={isEarningEdited ? pendingTotalEarnings[a.Employee_ID] : (a.total_earnings || 0)}',
    'value={isEarningEdited ? pendingTotalEarnings[a.Employee_ID] : defaultTotal}'
)

with open('d:/Docs/TFA Dashboard/tfa-dashboard/app/manager/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated earnings logic')

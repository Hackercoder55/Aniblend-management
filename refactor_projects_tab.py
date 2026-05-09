import re

with open('projects_extract.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace individual editing states with pendingProjectEdits
old_states = """  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [newStatus, setNewStatus] = useState<string>('')
  const [newPriority, setNewPriority] = useState<string>('Low')
  const [newComment, setNewComment] = useState<string>('')
  const [newAssignedHead, setNewAssignedHead] = useState<string>('')
  const [newProgress, setNewProgress] = useState<string>('')
  const [newEmpType, setNewEmpType] = useState<string>('')
  const [newWarning, setNewWarning] = useState<string>('')
  const [newAcknowledgement, setNewAcknowledgement] = useState<string>('')"""

new_states = """  const [pendingProjectEdits, setPendingProjectEdits] = useState<Record<string, Partial<Project>>>({})
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set())"""

code = code.replace(old_states, new_states)

# Replace handleSaveStatus with handleSaveAllProjects
old_save_status_pattern = re.compile(r'  const handleSaveStatus = async \(project: Project\) => \{.*?setEditingProjectId\(null\)\n  \}', re.DOTALL)

new_save_all = """  const handleSaveAllProjects = async () => {
    const edits = Object.entries(pendingProjectEdits)
    if (edits.length === 0) return
    setIsUpdating(true)
    
    try {
      await Promise.all(edits.map(async ([projectId, changes]) => {
        const project = projects.find(p => p.Project_ID === projectId)
        if (!project) return
        
        let payload: any = { ...changes }
        
        if (changes.Status === 'Review' && project.Status !== 'Review') {
          payload['viewport_date'] = formatDate()
        }
        if (changes.Status === 'Approved' && project.Status !== 'Approved') {
          payload['Date Approved'] = formatDate()
          payload['Approved_Date'] = formatDate()
          payload['approval_notified'] = true
        }
        
        const { error } = await apiClient.from('projects').update(payload).eq('Project_ID', projectId)
        
        if (!error && changes.Status === 'Approved' && project.Status !== 'Approved') {
          if (project.Employee_ID) {
            const { data: anim } = await apiClient.from('animators').select('*').eq('Employee_ID', project.Employee_ID).single()
            if (anim) {
              await apiClient.from('animators')
                .update({ 'Current video': Math.max(0, (anim['Current video'] || 1) - 1), 'Total video': (anim['Total video'] || 0) + 1 })
                .eq('Employee_ID', project.Employee_ID)
            }
            await apiClient.from('payments')
              .update({ Approved_Date: formatDate() })
              .eq('Project ID', project.Project_ID)
          }

          try {
            if (project.Thread_ID) {
              const animTag = project.Discord_ID ? `<@${project.Discord_ID}>` : '@Animator'
              const titleLine = project.Project_title
                ? `**Project:** ${project.Project_title} (\`${project.Project_ID}\`)\n`
                : `**Project ID:** \`${project.Project_ID}\`\n`
              const msg = `━━━━━━━━━━━━━━━━━━━━━━━━\n✅ **PROJECT APPROVED!**\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n🎉 Congratulations ${animTag}!\n\n${titleLine}Your video has been reviewed and officially approved! 🙌\n\n💰 **Regarding Payment:**\nThere is no need to fill any payment form. Your payment will be automatically processed and released at the **end of the month**.\n\nWe will notify you here once the payment has been sent. Thank you for your excellent work! 🚀\n━━━━━━━━━━━━━━━━━━━━━━━━`
              await fetch('/api/discord/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ threadId: project.Thread_ID, message: msg }),
              })
            }
          } catch {}
        }
      }))
      
      addToast(`✅ Saved ${edits.length} projects successfully!`)
      setPendingProjectEdits({})
      setEditingRows(new Set())
      onRefresh()
    } catch (err: any) {
      addToast(`❌ Update failed: ${err.message}`, 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const startEditing = (p: Project) => {
    setPendingProjectEdits(prev => ({
      ...prev,
      [p.Project_ID]: prev[p.Project_ID] || {
        Status: p.Status,
        Priority: p.Priority || 'Low',
        Head_Comment: p.Head_Comment || '',
        assigned_head: p.assigned_head || '',
        progress: p.progress || '',
        emp_type: p.emp_type || '',
        warning: p.warning || '',
        acknowledgement: p.acknowledgement || ''
      }
    }))
    setEditingRows(prev => new Set(prev).add(p.Project_ID))
  }

  const cancelEditing = (id: string) => {
    setPendingProjectEdits(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setEditingRows(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const updateEdit = (id: string, field: string, value: string) => {
    setPendingProjectEdits(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }))
  }"""

code = old_save_status_pattern.sub(new_save_all, code)

# We need to insert the master Save button right before the Filters 
# Filters start with: `<div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">`

master_button = """      {Object.keys(pendingProjectEdits).length > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center justify-between sticky top-20 z-10 shadow-sm">
          <div>
            <h3 className="font-bold text-indigo-900">You have {Object.keys(pendingProjectEdits).length} unsaved changes</h3>
            <p className="text-xs text-indigo-700">Review your edits below and click Save All when ready.</p>
          </div>
          <button 
            onClick={handleSaveAllProjects} 
            disabled={isUpdating}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 shadow-sm"
            style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}
          >
            {isUpdating ? 'Saving...' : `Save All Changes`}
          </button>
        </div>
      )}
      
      {/* Filters */}"""

code = code.replace('{/* Filters */}', master_button)

# Now the tedious part: replacing editingProjectId === p.Project_ID with editingRows.has(p.Project_ID)
# and all the value/onChange bindings.

# For each table cell (td), we need to update the logic.
# Since this is a bit too complex for simple string replace without breaking things, I'll use regex.

# We will replace all occurrences of `editingProjectId === p.Project_ID` with `editingRows.has(p.Project_ID)`
code = code.replace("editingProjectId === p.Project_ID", "editingRows.has(p.Project_ID)")

# Now replace the value= and onChange= for all inputs/selects inside the map function.
# Progress:
code = code.replace("value={newProgress}\n                        onChange={e => setNewProgress(e.target.value)}", 
                    "value={pendingProjectEdits[p.Project_ID]?.progress || ''}\n                        onChange={e => updateEdit(p.Project_ID, 'progress', e.target.value)}")
# Emp Type:
code = code.replace("value={newEmpType}\n                        onChange={e => setNewEmpType(e.target.value)}", 
                    "value={pendingProjectEdits[p.Project_ID]?.emp_type || ''}\n                        onChange={e => updateEdit(p.Project_ID, 'emp_type', e.target.value)}")
# Warning:
code = code.replace("value={newWarning}\n                        onChange={e => setNewWarning(e.target.value)}", 
                    "value={pendingProjectEdits[p.Project_ID]?.warning || ''}\n                        onChange={e => updateEdit(p.Project_ID, 'warning', e.target.value)}")
# Assigned Head:
code = code.replace("value={newAssignedHead}\n                        onChange={e => setNewAssignedHead(e.target.value)}", 
                    "value={pendingProjectEdits[p.Project_ID]?.assigned_head || ''}\n                        onChange={e => updateEdit(p.Project_ID, 'assigned_head', e.target.value)}")
# Priority:
code = code.replace("value={newPriority}\n                        onChange={e => setNewPriority(e.target.value)}", 
                    "value={pendingProjectEdits[p.Project_ID]?.Priority || 'Low'}\n                        onChange={e => updateEdit(p.Project_ID, 'Priority', e.target.value)}")
# Comment:
code = code.replace("value={newComment}\n                        onChange={e => setNewComment(e.target.value)}", 
                    "value={pendingProjectEdits[p.Project_ID]?.Head_Comment || ''}\n                        onChange={e => updateEdit(p.Project_ID, 'Head_Comment', e.target.value)}")
# Status:
code = code.replace("value={newStatus}\n                        onChange={e => setNewStatus(e.target.value)}", 
                    "value={pendingProjectEdits[p.Project_ID]?.Status || ''}\n                        onChange={e => updateEdit(p.Project_ID, 'Status', e.target.value)}")


# Finally, the action buttons in the last column:
old_actions = """                  <td className="px-4 py-3 text-center">
                    {editingRows.has(p.Project_ID) ? (
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleSaveStatus(p)}
                          disabled={isUpdating}
                          className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                          {isUpdating ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingProjectId(null)}
                          disabled={isUpdating}
                          className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-[10px] font-bold hover:bg-gray-300 transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => {
                            setEditingProjectId(p.Project_ID)
                            setNewStatus(p.Status)
                            setNewPriority(p.Priority || 'Low')
                            setNewComment(p.Head_Comment || '')
                            setNewAssignedHead(p.assigned_head || '')
                            setNewProgress(p.progress || '')
                            setNewEmpType(p.emp_type || '')
                            setNewWarning(p.warning || '')
                            setNewAcknowledgement(p.acknowledgement || '')
                          }}
                          disabled={isUpdating}
                          className="px-3 py-1 bg-gray-50 text-gray-600 rounded-lg text-[10px] font-bold border border-gray-200 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-50"
                        >
                          Edit
                        </button>"""

# Using regex because spacing might differ slightly
# We just want to replace the buttons logic

code = code.replace("setEditingProjectId(null)", "cancelEditing(p.Project_ID)")

edit_button_old = """                          onClick={() => {
                            setEditingProjectId(p.Project_ID)
                            setNewStatus(p.Status)
                            setNewPriority(p.Priority || 'Low')
                            setNewComment(p.Head_Comment || '')
                            setNewAssignedHead(p.assigned_head || '')
                            setNewProgress(p.progress || '')
                            setNewEmpType(p.emp_type || '')
                            setNewWarning(p.warning || '')
                            setNewAcknowledgement(p.acknowledgement || '')
                          }}"""

edit_button_new = """                          onClick={() => startEditing(p)}"""
code = code.replace(edit_button_old, edit_button_new)

save_button_old = """                        <button
                          onClick={() => handleSaveStatus(p)}
                          disabled={isUpdating}
                          className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                          {isUpdating ? 'Saving...' : 'Save'}
                        </button>"""
save_button_new = """                        <button
                          onClick={() => setEditingRows(prev => { const n = new Set(prev); n.delete(p.Project_ID); return n; })}
                          disabled={isUpdating}
                          className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                          Done
                        </button>"""
code = code.replace(save_button_old, save_button_new)

# Wait, the tr highlighting!
# If the project is staged for edits (i.e. pendingProjectEdits has it), we should highlight the row slightly even if it's not currently being "Edited".
code = code.replace('<tr key={p.Project_ID} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">',
                    '<tr key={p.Project_ID} className={`border-b border-gray-50 transition-colors ${pendingProjectEdits[p.Project_ID] ? "bg-indigo-50/30 border-l-4 border-l-indigo-400" : "hover:bg-gray-50/50"}`}>')


with open('projects_extract_modified.js', 'w', encoding='utf-8') as f:
    f.write(code)

with open('d:/Docs/TFA Dashboard/tfa-dashboard/app/manager/page.tsx', 'r', encoding='utf-8') as f:
    full_code = f.read()

# Replace the original ProjectsTab with the new one
pattern = re.compile(r'function ProjectsTab\(.*?\{[\s\S]*?(?=export default function)', re.DOTALL)
final_code = full_code[:pattern.search(full_code).start()] + code + '\n' + full_code[pattern.search(full_code).end():]

with open('d:/Docs/TFA Dashboard/tfa-dashboard/app/manager/page.tsx', 'w', encoding='utf-8') as f:
    f.write(final_code)

print("ProjectsTab Bulk Edit updated successfully.")

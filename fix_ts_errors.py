import re

with open('d:/Docs/TFA Dashboard/tfa-dashboard/app/manager/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Add total_earnings to Animator interface
content = content.replace(
    "  'Total video': number\n  Role?: string\n",
    "  'Total video': number\n  Role?: string\n  total_earnings?: number\n"
)

# Fix 2: TiersTab data type
content = content.replace(
    "apiClient.from('payments').select('*').then(({ data }) => {",
    "apiClient.from('payments').select('*').then(({ data }: { data: any }) => {"
)

# Fix 3: Mobile View ProjectsTab Buttons
old_mobile_edit_btn = """                          <button onClick={() => {
                            setEditingProjectId(p.Project_ID);
                            setNewStatus(p.Status);
                            setNewPriority(p.Priority || 'Low');
                            setNewComment(p.Head_Comment || '');
                            setNewAssignedHead(p.assigned_head || '');
                            setNewProgress(p.progress || '');
                            setNewEmpType(p.emp_type || '');
                            setNewWarning(p.warning || '');
                            setNewAcknowledgement(p.acknowledgement || '');
                            setDeletingProjectId(null)
                          }} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors">Edit</button>"""

new_mobile_edit_btn = """                          <button onClick={() => {
                            startEditing(p);
                            setDeletingProjectId(null)
                          }} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors">Edit</button>"""

content = content.replace(old_mobile_edit_btn, new_mobile_edit_btn)


# And the save/cancel buttons in mobile view:
old_mobile_save_cancel = """                        <>
                          <button onClick={() => handleSaveStatus(p)} disabled={isUpdating} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50">Save</button>
                          <button onClick={() => setEditingProjectId(null)} disabled={isUpdating} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">Cancel</button>
                        </>"""

new_mobile_save_cancel = """                        <>
                          <button onClick={() => setEditingRows(prev => { const n = new Set(prev); n.delete(p.Project_ID); return n; })} disabled={isUpdating} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50">Done</button>
                          <button onClick={() => cancelEditing(p.Project_ID)} disabled={isUpdating} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">Cancel</button>
                        </>"""

content = content.replace(old_mobile_save_cancel, new_mobile_save_cancel)


# There's another `editingProjectId === p.Project_ID` check in the mobile view wrapping the buttons
content = content.replace("editingProjectId === p.Project_ID ? (", "editingRows.has(p.Project_ID) ? (")

with open('d:/Docs/TFA Dashboard/tfa-dashboard/app/manager/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed mobile view TS errors")

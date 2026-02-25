import os
import io

file_path = 'app/manager/page.tsx'

with io.open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

if "import { supabase } from '@/lib/supabase'" in content:
    content = content.replace("import { supabase } from '@/lib/supabase'", "")

api_client_code = """
// --- Secure Server-Side Proxy Client ---
// Replaces the direct Supabase client to fix ISP routing blocks
const apiClient = {
  from: (table: string) => {
    let _action = 'select';
    let _payload: any = null;
    let _match: any = null;
    let _inMatch: any = null;
    let _order: any = null;
    let _single = false;

    const builder: any = {
      select(params?: string) { _action = 'select'; _payload = params; return builder; },
      insert(payload: any) { _action = 'insert'; _payload = payload; return builder; },
      update(payload: any) { _action = 'update'; _payload = payload; return builder; },
      delete() { _action = 'delete'; return builder; },
      eq(col: string, val: any) { _match = _match || {}; _match[col] = val; return builder; },
      in(col: string, vals: any[]) { _inMatch = { column: col, values: vals }; return builder; },
      order(col: string, opts?: any) { _order = { column: col, options: opts }; return builder; },
      single() { _single = true; return builder; },
      then(resolve: (value: any) => void, reject: (reason?: any) => void) {
        fetch(`/api/${table}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: _action, payload: _payload, match: _match, inMatch: _inMatch, order: _order, single: _single })
        })
        .then(res => res.json().then(data => res.ok ? data : Promise.reject(data.error)))
        .then(data => resolve({ data: data.data, error: null }))
        .catch(error => resolve({ data: null, error: typeof error === 'string' ? { message: error } : error }));
      }
    };
    return builder as PromiseLike<any> & any;
  }
};
// ----------------------------------------
"""

if 'export default function ManagerDashboard' in content:
    content = content.replace('export default function ManagerDashboard', api_client_code + '\nexport default function ManagerDashboard')

content = content.replace('supabase.from', 'apiClient.from')

with io.open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully migrated queries to the API client!")

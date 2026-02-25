const fs = require('fs');
const path = require('path');

const tables = ['projects', 'animators', 'form_submissions', 'payments', 'notes', 'leads'];

const template = `import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await request.json();
    const { action, payload, match, inMatch, order, single } = body;
    
    let query: any = supabaseAdmin.from('TABLE_NAME');

    if (action === 'select') {
      query = query.select(payload || '*');
    } else if (action === 'insert') {
      query = query.insert(payload);
    } else if (action === 'update') {
      query = query.update(payload);
    } else if (action === 'delete') {
      query = query.delete();
    }

    if (match) {
      query = query.match(match);
    }
    if (inMatch) {
      query = query.in(inMatch.column, inMatch.values);
    }
    if (order) {
      query = query.order(order.column, order.options);
    }
    if (single) {
      query = query.single();
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('API Route Error [TABLE_NAME]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
`;

tables.forEach(table => {
  const dir = path.join(__dirname, 'app', 'api', table);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = template.replace(/TABLE_NAME/g, table);
  fs.writeFileSync(path.join(dir, 'route.ts'), content);
});

console.log('Created routes for', tables);

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kmufnnqpsosnwpxredxt.supabase.co';
const supabaseKey = 'sb_publishable_wqYXYwhbO0R1vECkxZxIiA_h2C76XIw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: projects, error: pErr } = await supabase.from('projects').select('id, project_name, bids(id)');
  if (pErr) { console.error(pErr); return; }
  console.log("Projects:");
  for (const p of projects) {
    console.log(`- ${p.project_name}: ${p.bids?.length || 0} bids`);
    if (p.bids && p.bids.length > 0) {
      const { data: bids } = await supabase.from('bids').select('id, company_name, base_total').eq('project_id', p.id);
      console.log(`  Actual bids rows for ${p.project_name}: ${bids.length}`);
    }
  }
}
check();

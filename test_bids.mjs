import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kmufnnqpsosnwpxredxt.supabase.co';
const supabaseKey = 'sb_publishable_wqYXYwhbO0R1vECkxZxIiA_h2C76XIw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: projects, error } = await supabase.from('projects').select('id, project_name, bids(id)');
  if (error) {
    console.log("Error querying projects:", error);
    return;
  }
  console.log("Projects fetched:", projects.length);
  for (const p of projects) {
    console.log(`Project: ${p.project_name}, Bids count from join: ${p.bids?.length || 0}`);
    const { data: bidsData } = await supabase.from('bids').select('*').eq('project_id', p.id);
    console.log(`Bids count from direct query: ${bidsData?.length || 0}`);
  }
}
test();

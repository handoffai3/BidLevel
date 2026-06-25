import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kmufnnqpsosnwpxredxt.supabase.co';
const supabaseKey = 'sb_publishable_wqYXYwhbO0R1vECkxZxIiA_h2C76XIw';

export const supabase = createClient(supabaseUrl, supabaseKey);

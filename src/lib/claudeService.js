import { supabase } from './supabase';

/**
 * Downloads a file from Supabase Storage and converts it to base64.
 * @param {string} storagePath — path inside the bid-files bucket
 * @returns {{ base64: string, mimeType: string }}
 */
export async function downloadFileAsBase64(storagePath) {
  const { data, error } = await supabase.storage
    .from('bid-files')
    .download(storagePath);

  if (error) throw new Error(`Failed to download file: ${error.message}`);

  const arrayBuffer = await data.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  // Determine MIME type from file extension
  const ext = storagePath.split('.').pop().toLowerCase();
  const mimeMap = {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  return {
    base64,
    mimeType: mimeMap[ext] || 'application/octet-stream',
  };
}

/**
 * Sends a file to the Supabase Edge Function for analysis.
 * @param {string} fileBase64 — base64 encoded file content
 * @param {string} fileName — original filename
 * @param {string} mimeType — MIME type of the file
 * @returns {object} — parsed JSON result from Claude
 */
export async function analyzeBidWithClaude(fileBase64, fileName, mimeType) {
  const { data, error } = await supabase.functions.invoke('analyze-bid', {
    body: { fileBase64, fileName, mimeType },
  });

  if (error) {
    throw new Error(error.message || 'Error communicating with Edge Function');
  }

  if (data.error) {
    throw new Error(data.error);
  }

  if (data.result?.parseError) {
    console.warn('Claude returned non-JSON response:', data.result.raw);
    throw new Error('Claude returned an unparseable response. The file may not be a valid bid document.');
  }

  return data.result;
}

/**
 * Processes a single bid: download → analyze → save results to Supabase.
 * Uses analysis_jobs table for tracking progress.
 * @param {object} bid — bid row from Supabase { id, project_id, file_name, file_url }
 * @param {function} onProgress — callback({ step, message })
 * @returns {object} — { scopeItemsCount, flagsCount, adjustedTotal }
 */
export async function processSingleBid(bid, onProgress = () => {}) {
  let jobId = null;

  try {
    // Create analysis_jobs row
    const { data: job, error: jobError } = await supabase
      .from('analysis_jobs')
      .insert([{
        project_id: bid.project_id,
        bid_id: bid.id,
        status: 'pending'
      }])
      .select()
      .single();

    if (!jobError && job) {
      jobId = job.id;
    }

    // Update job status to running
    if (jobId) {
      await supabase.from('analysis_jobs').update({ status: 'running' }).eq('id', jobId);
    }

    // Step 1: Download file
    onProgress({ step: 1, message: `Downloading ${bid.file_name}...` });
    
    const storagePath = bid.file_url.includes('bid-files/')
      ? bid.file_url.split('bid-files/')[1]
      : bid.file_url.includes('http')
        ? new URL(bid.file_url).pathname.split('/object/public/bid-files/')[1] || bid.file_url
        : bid.file_url;

    const { base64, mimeType } = await downloadFileAsBase64(storagePath);

    // Step 2: Send to Edge Function / Claude
    onProgress({ step: 2, message: `Analyzing ${bid.file_name} with AI...` });
    const result = await analyzeBidWithClaude(base64, bid.file_name, mimeType);

    // Step 3: Save company_name and base_total to bids table
    onProgress({ step: 3, message: 'Saving extracted data...' });
    
    const baseTotal = result.base_total || 0;
    
    let totalGapAdjustment = 0;
    if (result.flags && result.flags.length > 0) {
      for (const flag of result.flags) {
        const gapLow = flag.gap_low || 0;
        const gapHigh = flag.gap_high || 0;
        const gapAvg = (gapLow + gapHigh) / 2;
        totalGapAdjustment += gapAvg;
      }
    }
    const adjustedTotal = baseTotal + totalGapAdjustment;

    let riskLevel = 'low';
    if (result.flags && result.flags.length >= 3) riskLevel = 'high';
    else if (result.flags && result.flags.length >= 1) riskLevel = 'medium';

    await supabase
      .from('bids')
      .update({
        company_name: result.company_name || bid.company_name,
        base_total: baseTotal,
        adjusted_total: adjustedTotal,
        risk_level: riskLevel,
      })
      .eq('id', bid.id);

    // Step 4: Save scope_items
    onProgress({ step: 4, message: 'Saving scope items...' });
    
    if (result.scope_items && result.scope_items.length > 0) {
      const scopeRows = result.scope_items.map(item => ({
        project_id: bid.project_id,
        bid_id: bid.id,
        item_name: item.item_name,
        amount: item.amount || 0,
        status: item.status || 'included',
        is_flagged: (result.flags || []).some(f => f.item_name === item.item_name),
      }));

      await supabase.from('scope_items').insert(scopeRows);
    }

    // Step 5: Save flags
    onProgress({ step: 5, message: 'Saving flags...' });
    
    if (result.flags && result.flags.length > 0) {
      const flagRows = result.flags.map(flag => ({
        project_id: bid.project_id,
        bid_id: bid.id,
        scope_item_id: null, // Note: linking specifically to scope_items would require lookup
        item_name: flag.item_name,
        flag_type: flag.flag_type,
        extracted_text: flag.extracted_text,
        gap_low: flag.gap_low || 0,
        gap_high: flag.gap_high || 0,
        gap_average: ((flag.gap_low || 0) + (flag.gap_high || 0)) / 2,
        recommendation: flag.recommendation,
        is_reviewed: false,
      }));

      await supabase.from('flags').insert(flagRows);
    }

    // Mark job as done
    if (jobId) {
      await supabase.from('analysis_jobs')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', jobId);
    }

    return {
      companyName: result.company_name || bid.company_name,
      scopeItemsCount: result.scope_items?.length || 0,
      flagsCount: result.flags?.length || 0,
      baseTotal,
      adjustedTotal,
    };
  } catch (err) {
    // Mark job as error
    if (jobId) {
      await supabase.from('analysis_jobs')
        .update({ status: 'error', error_message: err.message, completed_at: new Date().toISOString() })
        .eq('id', jobId);
    }
    throw err;
  }
}

/**
 * Processes ALL bids for a project, one at a time.
 * Updates project status to "ready" when done.
 * @param {string} projectId 
 * @param {function} onBidProgress — callback({ bidIndex, totalBids, step, message })
 * @returns {object} — summary stats
 */
export async function processAllBids(projectId, onBidProgress = () => {}) {
  // Fetch all bids for this project
  const { data: bids, error } = await supabase
    .from('bids')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch bids: ${error.message}`);
  if (!bids || bids.length === 0) throw new Error('No bids found for this project');

  const results = [];

  // Process each bid one at a time
  for (let i = 0; i < bids.length; i++) {
    const bid = bids[i];

    const bidResult = await processSingleBid(bid, ({ step, message }) => {
      onBidProgress({
        bidIndex: i,
        totalBids: bids.length,
        step,
        totalSteps: 5,
        message,
        fileName: bid.file_name,
      });
    });

    results.push(bidResult);
  }

  // Update project status to "ready"
  await supabase
    .from('projects')
    .update({ status: 'ready' })
    .eq('id', projectId);

  // Calculate summary
  const totalScopeItems = results.reduce((sum, r) => sum + r.scopeItemsCount, 0);
  const totalFlags = results.reduce((sum, r) => sum + r.flagsCount, 0);

  return {
    bidsProcessed: results.length,
    totalScopeItems,
    totalFlags,
    results,
  };
}

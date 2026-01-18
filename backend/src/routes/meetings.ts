import express, { Request, Response } from 'express';
import { fetchAllMeetings, filterMeetingsByDate, sortMeetingsByDate } from '../services/councilMeetingsService.js';
import { GeminiService } from '../services/gemini.service.js';
import type { MeetingRecord } from '../types/meeting.js';

const router = express.Router();

// Initialize Gemini service lazily
let geminiService: GeminiService | null = null;

const getGeminiService = (): GeminiService | null => {
  if (geminiService) return geminiService;

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    try {
      geminiService = new GeminiService(geminiApiKey);
    } catch (error) {
      console.error('Failed to initialize Gemini service:', error);
    }
  }
  return geminiService;
};

/**
 * GET /api/meetings
 * Query params:
 *   - startDate: YYYY-MM-DD (optional)
 *   - endDate: YYYY-MM-DD (optional)
 * 
 * Returns: Server-Sent Events stream with meeting decisions
 * Events:
 *   - meeting: A meeting with its AI-extracted decisions
 *   - complete: All meetings processed
 *   - error: An error occurred
 */
router.get('/meetings', async (req: Request, res: Response) => {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { startDate, endDate } = req.query;

    console.log('\n=== Fetching Meetings (SSE) ===');
    console.log(`Date range: ${startDate || 'any'} to ${endDate || 'any'}`);

    // Step 1: Fetch all meetings from Vancouver API
    const allMeetings = await fetchAllMeetings('previous');

    // Step 2: Filter by date range
    const filteredMeetings = filterMeetingsByDate(
      allMeetings,
      startDate as string | undefined,
      endDate as string | undefined
    );

    console.log(`Filtered to ${filteredMeetings.length} meetings`);

    // Step 3: Sort by date descending
    const sortedMeetings = sortMeetingsByDate(filteredMeetings);

    // Step 4: Process meetings concurrently with PDF extraction and Gemini analysis
    const service = getGeminiService();

    // State for maintaining order in concurrent processing
    let nextIndexToSend = 0;
    const pendingResults = new Map<number, MeetingRecord>();
    let currentIndex = 0;

    // Sends buffered results in sequential order
    const sendPendingResults = () => {
      while (pendingResults.has(nextIndexToSend)) {
        const meeting = pendingResults.get(nextIndexToSend)!;
        pendingResults.delete(nextIndexToSend);
        sendEvent('meeting', meeting);
        console.log(`  -> Sent meeting ${meeting.id} (index ${nextIndexToSend})`);
        nextIndexToSend++;
      }
    };

    // Worker function that processes meetings concurrently
    const worker = async () => {
      const { extractMeetingText } = await import('../services/pdfExtractorService.js');
      
      while (true) {
        // Atomically claim next meeting index
        const meetingIndex = currentIndex++;
        
        if (meetingIndex >= sortedMeetings.length) {
          break; // No more work
        }
        
        const meeting = sortedMeetings[meetingIndex];
        
        try {
          let meetingWithDecisions: MeetingRecord = { ...meeting };

          // Extract PDF text
          const pdfText = await extractMeetingText(meeting);
          
          if (pdfText) {
            meetingWithDecisions.pdfText = pdfText;

            // Process with Gemini if available
            if (service) {
              console.log(`Processing meeting ${meeting.id} (index ${meetingIndex}) with Gemini...`);
              const decisions = await service.extractMeetingDecisions(pdfText);
              meetingWithDecisions.decisions = decisions;
              console.log(`  Extracted ${decisions.length} decisions from meeting ${meeting.id}`);
            }
          }

          // Buffer result for sequential sending
          pendingResults.set(meetingIndex, meetingWithDecisions);
          sendPendingResults();

        } catch (error: any) {
          console.error(`Error processing meeting ${meeting.id}:`, error.message);
          // Store original meeting to maintain sequence
          pendingResults.set(meetingIndex, meeting);
          sendPendingResults();
        }
      }
    };

    // Start concurrent worker pool
    const maxWorkers = 5;
    console.log(`⚡ Starting worker pool with ${maxWorkers} concurrent workers...`);
    const workers = Array(maxWorkers).fill(null).map(() => worker());
    
    // Wait for all workers to complete
    await Promise.all(workers);

    // Send completion event
    sendEvent('complete', { count: sortedMeetings.length });
    console.log('=== SSE Stream Complete ===\n');

  } catch (error: any) {
    console.error('Error in /api/meetings:', error.message);
    sendEvent('error', { message: error.message });
  } finally {
    res.end();
  }
});

/**
 * GET /api/meetings/test
 * Test endpoint to verify API connectivity without PDF extraction
 */
router.get('/meetings/test', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    console.log('\n=== Test Endpoint ===');

    const allMeetings = await fetchAllMeetings('previous');
    const filteredMeetings = filterMeetingsByDate(
      allMeetings,
      startDate as string | undefined,
      endDate as string | undefined
    );
    const sortedMeetings = sortMeetingsByDate(filteredMeetings);

    // Return only first 10 meetings without PDF extraction
    const sampleMeetings = sortedMeetings.slice(0, 10);

    res.json({
      success: true,
      totalCount: sortedMeetings.length,
      sampleCount: sampleMeetings.length,
      meetings: sampleMeetings
    });

  } catch (error: any) {
    console.error('Error in /api/meetings/test:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch meetings',
      message: error.message
    });
  }
});

export default router;

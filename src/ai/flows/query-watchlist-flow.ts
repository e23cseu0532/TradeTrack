'use server';
/**
 * @fileoverview A flow that allows a user to ask natural language questions about their watchlist.
 *
 * - queryWatchlist - A function that invokes the watchlist querying flow.
 * - QueryWatchlistInput - The input type for the queryWatchlist function.
 * - QueryWatchlistOutput - The return type for the queryWatchlist function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// Define the schema for a single stock record within the watchlist context
const WatchlistStockSchema = z.object({
  id: z.string(),
  stockSymbol: z.string(),
  entryPrice: z.number(),
  stopLoss: z.number(),
  targetPrice: z.number(),
  riskLevel: z.enum(['Low', 'Medium', 'High', 'Unknown']),
  currentPrice: z.number().nullable(),
});

// Define the input schema for the main flow
const QueryWatchlistInputSchema = z.object({
  query: z.string().describe('The natural language query from the user.'),
  watchlist: z.array(WatchlistStockSchema).describe('The user\'s current watchlist data.'),
});
export type QueryWatchlistInput = z.infer<typeof QueryWatchlistInputSchema>;

// Define the output schema for the main flow
const QueryWatchlistOutputSchema = z.object({
  answer: z.string().describe('A conversational, natural language answer to the user\'s query.'),
});
export type QueryWatchlistOutput = z.infer<typeof QueryWatchlistOutputSchema>;

// Define the main prompt. Note: No tools are needed here because we pass all context directly.
const prompt = ai.definePrompt({
  name: 'queryWatchlistPrompt',
  input: { schema: QueryWatchlistInputSchema },
  output: { schema: QueryWatchlistOutputSchema },
  prompt: `You are a helpful financial assistant for a stock tracking application.
Your task is to answer a user's question about their personal stock watchlist.

You will be provided with the user's question and a JSON object representing their full watchlist, including real-time data like current price and pre-calculated risk levels.

Analyze the user's query and the provided watchlist data to formulate a clear, accurate, and conversational answer.

If the user's question cannot be answered with the provided data, politely state that you do not have the information required. Do not make up data.

User's Question:
"{{{query}}}"

User's Watchlist Data:
{{{json watchlist}}}

Formulate your answer based on this data.`,
});

// Define the main flow that orchestrates the process
const queryWatchlistFlow = ai.defineFlow(
  {
    name: 'queryWatchlistFlow',
    inputSchema: QueryWatchlistInputSchema,
    outputSchema: QueryWatchlistOutputSchema,
  },
  async (input) => {
    // Since all data is passed in the input, we can directly call the prompt.
    const { output } = await prompt(input);
    if (!output) {
      return {
        answer: "I'm sorry, I was unable to process your request at this time.",
      };
    }
    return output;
  }
);

// Export a wrapper function to be called from the frontend
export async function queryWatchlist(
  input: QueryWatchlistInput
): Promise<QueryWatchlistOutput> {
  return queryWatchlistFlow(input);
}

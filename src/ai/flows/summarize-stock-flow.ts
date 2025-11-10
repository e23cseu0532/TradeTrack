'use server';
/**
 * @fileoverview A flow that summarizes recent news for a given stock symbol.
 *
 * - summarizeStock - A function that invokes the summarization flow.
 * - SummarizeStockInput - The input type for the summarizeStock function.
 * - SummarizeStockOutput - The return type for the summarizeStock function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const SummarizeStockInputSchema = z.object({
  stockSymbol: z.string().describe('The stock symbol to summarize.'),
});
export type SummarizeStockInput = z.infer<typeof SummarizeStockInputSchema>;

const SummarizeStockOutputSchema = z.object({
  summary: z
    .string()
    .describe('A 2-3 sentence summary of recent news and events.'),
});
export type SummarizeStockOutput = z.infer<typeof SummarizeStockOutputSchema>;

export async function summarizeStock(
  input: SummarizeStockInput
): Promise<SummarizeStockOutput> {
  return summarizeStockFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeStockPrompt',
  input: { schema: SummarizeStockInputSchema },
  output: { schema: SummarizeStockOutputSchema },
  prompt: `You are a financial news analyst. Based on your knowledge up to your last training data, provide a concise, neutral summary of the most significant recent news and events for the company with the stock symbol: {{{stockSymbol}}}.

Focus on factors that could influence its market performance. The summary should be objective and factual.

Limit the summary to 2-3 sentences.`,
});

const summarizeStockFlow = ai.defineFlow(
  {
    name: 'summarizeStockFlow',
    inputSchema: SummarizeStockInputSchema,
    outputSchema: SummarizeStockOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error('Failed to generate stock summary.');
    }
    return output;
  }
);

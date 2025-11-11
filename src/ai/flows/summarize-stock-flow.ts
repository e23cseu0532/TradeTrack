'use server';
/**
 * @fileoverview A flow that summarizes recent financial performance for a given stock symbol.
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
    .describe(
      'A summary of the latest financial quarter including key metrics like revenue, net profit, profit margins, and earnings per share (EPS). The response should be formatted as a concise paragraph.'
    ),
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
  prompt: `You are a financial analyst. Based on your knowledge up to your last training data, provide a summary of the latest financial quarter results for the company with the stock symbol: {{{stockSymbol}}}.

Focus on key metrics a trader needs, such as:
- Revenue and its growth
- Net Profit and its growth
- Profit Margins (Net and Operating)
- Earnings Per Share (EPS)

The summary should be objective, factual, and presented as a concise paragraph. Do not provide general news or market sentiment.`,
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
      throw new Error('Failed to generate stock financial summary.');
    }
    return output;
  }
);

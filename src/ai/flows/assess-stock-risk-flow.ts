'use server';
/**
 * @fileoverview A flow that assesses the risk level of a given stock.
 *
 * - assessStockRisk - A function that invokes the risk assessment flow.
 * - AssessStockRiskInput - The input type for the assessStockRisk function.
 * - AssessStockRiskOutput - The return type for the assessStockRisk function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { addDays } from 'date-fns';

// Define the schema for the tool's input
const StockDataToolInputSchema = z.object({
  symbol: z.string().describe('The stock symbol, e.g., "RELIANCE.NS"'),
});

// Define the tool that the AI can use to get stock data
const getStockDataTool = ai.defineTool(
  {
    name: 'getStockData',
    description: 'Fetches recent high, low, and current price for a stock symbol.',
    inputSchema: StockDataToolInputSchema,
    outputSchema: z.any(),
  },
  async ({ symbol }) => {
    try {
      const from = addDays(new Date(), -90).toISOString();
      const to = new Date().toISOString();
      // IMPORTANT: This assumes the app is running on localhost:9002 during development.
      // In a real deployment, this URL would need to be the absolute URL of the deployed app.
      const response = await fetch(`http://localhost:9002/api/yahoo-finance?symbol=${symbol}&from=${from}&to=${to}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Tool Error: Failed to fetch data for ${symbol}: ${errorText}`);
        return { error: `API request failed with status ${response.status}` };
      }
      const data = await response.json();
      if (data.error) {
        return { error: data.error };
      }
      return data;
    } catch (error: any) {
      console.error(`Tool Error: Exception when fetching data for ${symbol}`, error);
      return { error: error.message || 'An unknown error occurred.' };
    }
  }
);

// Define the input schema for the main flow
const AssessStockRiskInputSchema = z.object({
  stockSymbol: z.string().describe('The stock symbol to assess.'),
});
export type AssessStockRiskInput = z.infer<typeof AssessStockRiskInputSchema>;


// Define the output schema for the main flow
const AssessStockRiskOutputSchema = z.object({
  riskLevel: z.enum(['Low', 'Medium', 'High', 'Unknown'])
    .describe('The assessed risk level for the stock.'),
  explanation: z
    .string()
    .describe('A concise, one-sentence explanation for the risk assessment.'),
});
export type AssessStockRiskOutput = z.infer<typeof AssessStockRiskOutputSchema>;


// Define the main prompt, making it aware of the tool
const prompt = ai.definePrompt({
  name: 'assessStockRiskPrompt',
  input: { schema: AssessStockRiskInputSchema },
  output: { schema: AssessStockRiskOutputSchema },
  tools: [getStockDataTool],
  prompt: `You are a financial risk analyst. Your task is to assess the volatility and risk level of a stock based on its recent price data.

Use the provided 'getStockData' tool to fetch the 90-day price history (high, low, current price) for the stock symbol: {{{stockSymbol}}}.

Analyze the fetched data, specifically the difference between the high and low, and its relation to the current price. Based on this volatility, determine if the stock's risk is Low, Medium, or High.

- A 'Low' risk stock has minimal price fluctuations.
- A 'Medium' risk stock has moderate price swings.
- A 'High' risk stock has significant price fluctuations.

If you cannot fetch the data or the data is insufficient, classify the risk as 'Unknown' and explain that the data could not be retrieved.

Provide a concise, one-sentence explanation for your assessment.`,
});


// Define the main flow that orchestrates the process
const assessStockRiskFlow = ai.defineFlow(
  {
    name: 'assessStockRiskFlow',
    inputSchema: AssessStockRiskInputSchema,
    outputSchema: AssessStockRiskOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      return {
        riskLevel: 'Unknown',
        explanation: 'The AI model could not generate an assessment.',
      };
    }
    return output;
  }
);


// Export a wrapper function to be called from the frontend
export async function assessStockRisk(
  input: AssessStockRiskInput
): Promise<AssessStockRiskOutput> {
  return assessStockRiskFlow(input);
}

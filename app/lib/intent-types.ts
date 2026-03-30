/**
 * Intent types for AI response routing.
 * Used to determine how the UI should handle the AI's response.
 */

export type IntentType =
  | 'product_search'   // Show product results in grid
  | 'cart_action'      // Cart operation, show confirmation
  | 'product_inquiry'  // Answer about current product
  | 'general';         // Conversational response only

export interface IntentResult {
  type: IntentType;
  showProducts: boolean;
}

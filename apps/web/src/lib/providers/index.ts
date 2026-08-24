import { AnthropicScriptProvider } from "./anthropic-script-provider";
import type { ScriptProvider } from "./script";

export const scriptProvider: ScriptProvider = new AnthropicScriptProvider();

export type { ScriptGenerationInput, ScriptGenerationResult, ScriptProvider } from "./script";

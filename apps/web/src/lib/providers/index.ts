import { AnthropicScriptProvider } from "./anthropic-script-provider";
import { AnthropicStoryboardProvider } from "./anthropic-storyboard-provider";
import type { ScriptProvider } from "./script";
import type { StoryboardProvider } from "./storyboard";

export const scriptProvider: ScriptProvider = new AnthropicScriptProvider();
export const storyboardProvider: StoryboardProvider = new AnthropicStoryboardProvider();

export type { ScriptGenerationInput, ScriptGenerationResult, ScriptProvider } from "./script";
export type {
  StoryboardGenerationInput,
  StoryboardGenerationResult,
  StoryboardProvider,
  StoryboardScene,
} from "./storyboard";

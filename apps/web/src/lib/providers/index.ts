import { AnthropicScriptProvider } from "./anthropic-script-provider";
import { AnthropicStoryboardProvider } from "./anthropic-storyboard-provider";
import { ElevenLabsTTSProvider } from "./elevenlabs-tts-provider";
import { RunwayImageProvider } from "./runway-image-provider";
import { RunwayVideoProvider } from "./runway-video-provider";
import type { ImageProvider } from "./image";
import type { ScriptProvider } from "./script";
import type { StoryboardProvider } from "./storyboard";
import type { TTSProvider } from "./tts";
import type { VideoProvider } from "./video";

export const scriptProvider: ScriptProvider = new AnthropicScriptProvider();
export const storyboardProvider: StoryboardProvider = new AnthropicStoryboardProvider();
export const ttsProvider: TTSProvider = new ElevenLabsTTSProvider();
export const imageProvider: ImageProvider = new RunwayImageProvider();
export const videoProvider: VideoProvider = new RunwayVideoProvider();

export type { ScriptGenerationInput, ScriptGenerationResult, ScriptProvider } from "./script";
export type {
  StoryboardGenerationInput,
  StoryboardGenerationResult,
  StoryboardProvider,
  StoryboardScene,
} from "./storyboard";
export type { TTSGenerationInput, TTSGenerationResult, TTSProvider } from "./tts";
export type { ImageGenerationInput, ImageGenerationResult, ImageProvider } from "./image";
export type { VideoGenerationInput, VideoGenerationResult, VideoProvider } from "./video";
export { ratioForPlatform } from "./image";

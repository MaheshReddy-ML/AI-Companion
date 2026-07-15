export type AttentionState = "idle" | "listening" | "thinking" | "responding" | "curious" | "reflecting" | "excited";
export type BehaviorState = "Idle" | "Listening" | "Thinking" | "Speaking" | "Reacting" | "Reflecting";

export interface EmotionalVector {
  valence: number;
  arousal: number;
  dominance: number;
  confidence: number;
  curiosity: number;
  engagement: number;
  empathy: number;
}

export interface InternalThought {
  thinkingDurationMs: number;
  hesitationMs: number;
  reflectionDepth: number;
  responseConfidence: number;
  preSpeechBehavior: BehaviorState;
}

export interface BehaviorPlan {
  state: BehaviorState;
  attentionState: AttentionState;
  eyeContact: number;
  blinkRate: number;
  headTilt: number;
  gestureIntensity: number;
  gestureTempo: number;
  reactionDelayMs: number;
  microUncertainty: number;
  recognition: number;
}

export interface SpeechPlan {
  style: "warm" | "bright" | "curious" | "empathetic" | string;
  speed: number;
  pauseFrequency: number;
  pauseScale: number;
  emphasis: string[];
  vocalEnergy: number;
  emotionalIntensity: number;
  confidence: number;
  markupText: string;
}

export interface CompanionBrain {
  schemaVersion: "companion-brain.v1";
  characterId: "yuna" | "rose" | "robert" | "haru" | string;
  personality: Record<string, number>;
  emotion: EmotionalVector;
  internalThought: InternalThought;
  behavior: BehaviorPlan;
  speech: SpeechPlan;
  memory: {
    recognizedTopics: string[];
    familiarity: number;
    favoriteTopicSignal: number;
    novelty: number;
  };
  stateMachine: {
    current: BehaviorState;
    previous: BehaviorState;
    next: BehaviorState;
    transitions: string[];
  };
}

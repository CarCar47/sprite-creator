import { pollinations } from "./pollinations";
import { huggingface } from "./huggingface";
import { gemini } from "./gemini";
import type { ImageProvider, ProviderId } from "./types";
import { PROVIDER_IDS } from "./types";

const PROVIDERS: Record<ProviderId, ImageProvider> = {
  pollinations,
  huggingface,
  gemini,
};

const SELECTION_PRIORITY: ProviderId[] = ["huggingface", "pollinations", "gemini"];

export function getProvider(id: ProviderId): ImageProvider {
  return PROVIDERS[id];
}

export function listProviders(): ImageProvider[] {
  return PROVIDER_IDS.map((id) => PROVIDERS[id]);
}

export function listAvailableProviderIds(): ProviderId[] {
  return PROVIDER_IDS.filter((id) => PROVIDERS[id].isAvailable());
}

/**
 * Pick a default provider id. Honors `IMAGE_PROVIDER` env var if it points to an available
 * provider; otherwise falls through SELECTION_PRIORITY.
 */
export function pickDefaultProviderId(): ProviderId {
  const requested = process.env.IMAGE_PROVIDER as ProviderId | undefined;
  if (requested && PROVIDER_IDS.includes(requested) && PROVIDERS[requested].isAvailable()) {
    return requested;
  }
  for (const id of SELECTION_PRIORITY) {
    if (PROVIDERS[id].isAvailable()) return id;
  }
  // Pollinations is always available — this branch is defensive.
  return "pollinations";
}

export interface ProviderSummary {
  id: ProviderId;
  label: string;
  modelLabel: string;
  available: boolean;
  whyUnavailable: string | null;
  supportsReference: boolean;
}

export function summarizeProviders(): {
  available: ProviderId[];
  default: ProviderId;
  providers: ProviderSummary[];
} {
  return {
    available: listAvailableProviderIds(),
    default: pickDefaultProviderId(),
    providers: listProviders().map((p) => ({
      id: p.id,
      label: p.label,
      modelLabel: p.modelLabel,
      available: p.isAvailable(),
      whyUnavailable: p.whyUnavailable(),
      supportsReference: p.supportsReference,
    })),
  };
}

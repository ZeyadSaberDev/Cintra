export const SERVICE_API_CAPABILITIES = [
  'image',
  'search',
  'speech',
  'transcription',
  'embeddings',
] as const;

export type ServiceApiCapability = (typeof SERVICE_API_CAPABILITIES)[number];
export type ServiceApiRoutes = Record<ServiceApiCapability, string | null>;

export const DEFAULT_SERVICE_API_ROUTES: ServiceApiRoutes = {
  image: null,
  search: null,
  speech: null,
  transcription: null,
  embeddings: null,
};

import { api } from "../api/client";

export function assetUrl(url?: string) {
  return api.assetUrl(url);
}

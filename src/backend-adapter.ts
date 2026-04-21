import type {
  BackendAdapterEntityManifest,
  BackendAdapterManifest,
  BackendAdapterRealtimeManifest,
  BackendAdapterRestAuthPaths,
} from "./manifest";

export interface BackendAdapterClientTarget {
  manifest: BackendAdapterManifest;
  realtimeUrl?: string;
  serverUrl: string;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function joinUrl(baseUrl: string, path: string): string {
  return `${trimTrailingSlash(baseUrl)}${path}`;
}

function getEntityManifest(
  manifest: BackendAdapterManifest,
  entityName: string,
): BackendAdapterEntityManifest {
  const entity = manifest.entities.find((value) => value.name === entityName);

  if (!entity) {
    throw new Error(`Unknown backend adapter entity "${entityName}".`);
  }

  return entity;
}

export function resolveBackendAdapterAuthUrls(
  target: BackendAdapterClientTarget,
): Record<keyof BackendAdapterRestAuthPaths, string> {
  const { paths } = target.manifest.auth.rest;

  return {
    getKdfSalt: joinUrl(target.serverUrl, paths.getKdfSalt),
    login: joinUrl(target.serverUrl, paths.login),
    logout: joinUrl(target.serverUrl, paths.logout),
    refresh: joinUrl(target.serverUrl, paths.refresh),
    registerBegin: joinUrl(target.serverUrl, paths.registerBegin),
    registerComplete: joinUrl(target.serverUrl, paths.registerComplete),
  };
}

export function resolveBackendAdapterEntityUrl(
  target: BackendAdapterClientTarget,
  entityName: string,
): string {
  return joinUrl(target.serverUrl, getEntityManifest(target.manifest, entityName).rest.basePath);
}

export function resolveBackendAdapterRealtimeUrl(
  target: BackendAdapterClientTarget,
): string | undefined {
  const realtime = target.manifest.realtime;
  if (!realtime) {
    return undefined;
  }

  return joinRealtimeUrl(target, realtime);
}

function joinRealtimeUrl(
  target: BackendAdapterClientTarget,
  realtime: BackendAdapterRealtimeManifest,
): string {
  return joinUrl(target.realtimeUrl ?? target.serverUrl, realtime.path);
}

import { createPluginContext } from './context';
import type { AnimapPlugin, PluginManifest, PluginContext } from './types';

const registry = new Map<string, AnimapPlugin>();
const contexts = new Map<string, PluginContext>();

export const registerPlugin = (plugin: AnimapPlugin, pluginDir?: string) => {
  if (registry.has(plugin.manifest.id)) {
    throw new Error(`[plugins] duplicate plugin id: ${plugin.manifest.id}`);
  }
  const ctx = createPluginContext(plugin.manifest.id, pluginDir);
  plugin.setup(ctx);
  registry.set(plugin.manifest.id, plugin);
  contexts.set(plugin.manifest.id, ctx);
};

export const unregisterPlugin = (id: string): boolean => {
  const plugin = registry.get(id);
  if (!plugin) return false;
  try {
    plugin.stop?.();
  } catch (err) {
    console.error(`[plugins] stop failed during unregister: ${id}`, err);
  }
  registry.delete(id);
  contexts.delete(id);
  return true;
};

export const hasPlugin = (id: string): boolean => registry.has(id);

export const getPlugin = (id: string): AnimapPlugin | null => registry.get(id) || null;

export const getPluginContext = (id: string): PluginContext | null => contexts.get(id) || null;

export const listPluginManifests = (): PluginManifest[] =>
  Array.from(registry.values()).map((plugin) => plugin.manifest);

export const startPlugins = () => {
  for (const plugin of registry.values()) {
    try {
      plugin.start?.();
      console.log(`[plugins] started: ${plugin.manifest.id}`);
    } catch (err) {
      console.error(`[plugins] start failed: ${plugin.manifest.id}`, err);
    }
  }
};

export const stopPlugins = () => {
  for (const plugin of registry.values()) {
    try {
      plugin.stop?.();
    } catch (err) {
      console.error(`[plugins] stop failed: ${plugin.manifest.id}`, err);
    }
  }
};

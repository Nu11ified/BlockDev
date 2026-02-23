import type { FrameworkProvider, PluginRegistry } from "./plugin-api";

class PluginRegistryImpl implements PluginRegistry {
  private providers = new Map<string, FrameworkProvider>();

  register(provider: FrameworkProvider): void {
    if (this.providers.has(provider.id)) {
      console.warn(`Provider "${provider.id}" already registered, overwriting`);
    }
    this.providers.set(provider.id, provider);
    console.log(`Registered framework provider: ${provider.name} (${provider.id})`);
  }

  get(id: string): FrameworkProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): FrameworkProvider[] {
    return Array.from(this.providers.values());
  }
}

export function createPluginRegistry(): PluginRegistry {
  return new PluginRegistryImpl();
}

export async function loadBuiltinPlugins(
  registry: PluginRegistry,
  deps: { cachePath: string }
): Promise<void> {
  const { PaperProvider } = await import("./paper/index");
  const { FabricProvider } = await import("./fabric/index");
  const { KubeJSProvider } = await import("./kubejs/index");

  registry.register(new PaperProvider(deps.cachePath));
  registry.register(new FabricProvider(deps.cachePath));
  registry.register(new KubeJSProvider(deps.cachePath, registry));
}

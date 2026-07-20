import type { ComponentType } from "react";

export interface GeneratorModuleProps {
  readonly onRequestPrint: () => void;
}

export interface LoadedGeneratorModule {
  readonly Page: ComponentType<GeneratorModuleProps>;
}

interface GeneratorEntryBase {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

export interface LegacyGeneratorEntry extends GeneratorEntryBase {
  readonly kind: "legacy";
  readonly href: string;
}

export interface ReactGeneratorEntry extends GeneratorEntryBase {
  readonly kind: "react";
  readonly path: string;
  readonly load: () => Promise<LoadedGeneratorModule>;
}

export type GeneratorEntry = LegacyGeneratorEntry | ReactGeneratorEntry;

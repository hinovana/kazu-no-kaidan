/**
 * 「おなじのつなぎ」をSPA registryへ接続する遅延読込module。
 *
 * 教材固有のReact画面とCSSを、ホストが要求するLoadedGeneratorModuleへ適合させる。
 *
 * @packageDocumentation
 */

import type { LoadedGeneratorModule } from "../../src/app/generator-module.ts";
import { OnajiNoTsunagiPage } from "./ui/OnajiNoTsunagiPage.tsx";
import "./styles.css";

/** SPA registryへ渡す「おなじのつなぎ」の遅延読込module。 */
const generatorModule = {
  /** SPA hostが教材routeで描画するpage component。 */
  Page: OnajiNoTsunagiPage,
} satisfies LoadedGeneratorModule;

export default generatorModule;

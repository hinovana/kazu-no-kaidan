import type { LoadedGeneratorModule } from "../../src/app/generator-module.js";
import { KokugoNoTanePage } from "./ui/KokugoNoTanePage.js";
import "./styles.css";

const generatorModule = { Page: KokugoNoTanePage } satisfies LoadedGeneratorModule;

export default generatorModule;

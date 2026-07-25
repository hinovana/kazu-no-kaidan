import type { LoadedGeneratorModule } from "../../src/app/generator-module.ts";
import { OnajiNoTsunagiPage } from "./ui/OnajiNoTsunagiPage.tsx";
import "./styles.css";

const generatorModule = {
  Page: OnajiNoTsunagiPage,
} satisfies LoadedGeneratorModule;

export default generatorModule;

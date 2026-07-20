import { lazy, Suspense } from "react";
import {
  createHashRouter,
  Link,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import { generatorRegistry } from "./generator-registry.js";
import type { ReactGeneratorEntry } from "./generator-module.js";

const kokugoEntry = requireReactEntry("kokugo-no-tane");
const KokugoNoTanePage = lazy(async () => {
  const loaded = await kokugoEntry.load();
  return { default: loaded.Page };
});

const router = createHashRouter([
  {
    path: "/",
    element: <Outlet />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <GeneratorIndex /> },
      {
        path: kokugoEntry.path,
        element: (
          <Suspense fallback={<LoadingPage />}>
            <KokugoNoTanePage onRequestPrint={() => window.print()} />
          </Suspense>
        ),
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}

function GeneratorIndex() {
  return (
    <main className="generator-index">
      <h1>教材ジェネレータ</h1>
      <p className="generator-index-intro">作りたい教材を選んでください。</p>
      <div className="generator-list">
        {generatorRegistry.map((entry) => entry.kind === "legacy" ? (
          <a className="generator-card" href={entry.href} key={entry.id}>
            <h2>{entry.title}</h2>
            <p>{entry.description}</p>
          </a>
        ) : (
          <Link className="generator-card" to={entry.path} key={entry.id}>
            <h2>{entry.title}</h2>
            <p>{entry.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}

function LoadingPage() {
  return <main className="route-message" aria-live="polite">教材を読み込んでいます…</main>;
}

function RouteError() {
  return (
    <main className="route-message" role="alert">
      <h1>ページを表示できませんでした</h1>
      <Link to="/">教材一覧へ戻る</Link>
    </main>
  );
}

function requireReactEntry(id: string): ReactGeneratorEntry {
  const entry = generatorRegistry.find((candidate) => candidate.id === id);
  if (entry?.kind !== "react") {
    throw new Error(`React generator is not registered: ${id}`);
  }
  return entry;
}

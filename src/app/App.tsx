import { lazy, Suspense } from "react";
import {
  createHashRouter,
  Link,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import { generatorRegistry } from "./generator-registry.js";

const reactRoutes = generatorRegistry.flatMap((entry) => {
  if (entry.kind !== "react") {
    return [];
  }
  const GeneratorPage = lazy(async () => {
    const loaded = await entry.load();
    return { default: loaded.Page };
  });
  return [{
    path: entry.path,
    element: (
      <Suspense fallback={<LoadingPage />}>
        <GeneratorPage onRequestPrint={() => window.print()} />
      </Suspense>
    ),
  }];
});

const router = createHashRouter([
  {
    path: "/",
    element: <Outlet />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <GeneratorIndex /> },
      ...reactRoutes,
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

# おなじのつなぎ 開発資料

このディレクトリは、`generators/onaji-no-tsunagi/` の実装を読む人向けの補助資料を置く。
正誤ルール、唯一解契約、生成品質gateの正本は、引き続き [`../SPEC.md`](../SPEC.md) である。

## 文書一覧

| 文書 | 用途 |
| --- | --- |
| [ディレクトリ構成](directory-structure.md) | 各ディレクトリと主要ファイルの責務、依存方向、変更内容ごとの入口を確認する |
| [APIリファレンス](../../../docs/onaji-no-tsunagi/reference/index.html) | TypeDocがTSDocから生成したHTMLで、export APIの型、引数、戻り値、保証範囲を確認する |

## APIリファレンスの生成

リポジトリルートで次を実行する。

```bash
npm run docs:onaji-no-tsunagi
```

生成先は `docs/onaji-no-tsunagi/reference/` である。生成物は直接編集せず、
`application/`、`domain/`、`ui/` のTSDocまたは
`generators/onaji-no-tsunagi/typedoc.json`を変更して再生成する。

GitHub Pagesをbranchの`/docs`から配信する構成では、次のURLで閲覧できる。

```text
https://hinovana.github.io/kazu-no-kaidan/onaji-no-tsunagi/reference/
```

## 読む順序

1. 問題のルールや保証範囲を変える場合は [`../SPEC.md`](../SPEC.md) を読む。
2. 変更対象を探す場合は [ディレクトリ構成](directory-structure.md) を読む。
3. export APIの契約を調べる場合は [APIリファレンス](../../../docs/onaji-no-tsunagi/reference/index.html) を読む。
4. 実装と同じ階層の `tests/` から、変更内容に対応する検証を確認する。

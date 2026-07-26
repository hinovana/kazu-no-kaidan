# おなじのつなぎ 開発資料

このディレクトリは、`generators/onaji-no-tsunagi/` の実装を読む人向けの補助資料を置く。
正誤ルール、唯一解契約、生成品質gateの正本は、引き続き [`../SPEC.md`](../SPEC.md) である。

## 文書一覧

| 文書 | 用途 |
| --- | --- |
| [ディレクトリ構成](directory-structure.md) | 各ディレクトリと主要ファイルの責務、依存方向、変更内容ごとの入口を確認する |
| [6×6 原本基準・難易度監査](six-by-six-difficulty-audit.md) | 原本3問と生成3,000問の機械指標を比較し、人間レビュー対象を選ぶ |
| APIリファレンス（ローカル生成） | TypeDocがTSDocから生成したHTMLで、export APIの型、引数、戻り値、保証範囲を確認する |

## APIリファレンスの生成

リポジトリルートで次を実行する。

```bash
npm run docs:onaji-no-tsunagi
```

生成先は `docs/onaji-no-tsunagi/reference/` であり、入口は生成後の
`docs/onaji-no-tsunagi/reference/index.html`である。生成物はGit管理対象外とし、
直接編集しない。内容を変える場合は、`application/`、`domain/`、`ui/` のTSDocまたは
`generators/onaji-no-tsunagi/typedoc.json`を変更して再生成する。

現時点ではAPIリファレンスをGitHub Pagesへ自動公開しない。公開が必要になった場合は、
生成HTMLを通常のPRへ含めず、GitHub Actionsで生成してPagesのデプロイ成果物へ含める。

## 読む順序

1. 問題のルールや保証範囲を変える場合は [`../SPEC.md`](../SPEC.md) を読む。
2. 変更対象を探す場合は [ディレクトリ構成](directory-structure.md) を読む。
3. export APIの契約を調べる場合はAPIリファレンスを生成し、出力された`index.html`を読む。
4. 実装と同じ階層の `tests/` から、変更内容に対応する検証を確認する。

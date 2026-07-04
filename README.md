# 数字の階段

数字の階段の作問・解答確認ツールです。

## 構成

- `web/`: ブラウザ版ジェネレータ。ES Modulesを使うためHTTP配信で起動します。
- `cli/`: Python版のモデル、ソルバー、SVG/PDFレンダリング、テスト。

## Web

```bash
cd web
./server.sh
./server.sh 9000
npm test
```

## CLI

```bash
cd cli
python3 tests/test_digit_stairs.py
python3 tests/test_digit_stairs.py problem_models/problem1.json
```

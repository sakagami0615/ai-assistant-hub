# Claude Code with Ollama

Claude Code をローカル Ollama のモデルへ切り替えて使うための最小環境です。

## 構成

- `models/default.modelfile`: 引数未指定時に使われるデフォルトのモデル定義(現在は `qwen3.5-9b.modelfile` と同内容)
- `models/qwen3.5-9b.modelfile`: 既存の `qwen3.5:9b` をベースにした Claude Code 用モデル定義
- `models/gemma4-coder.modelfile`: 既存の `gemma4:latest` をベースにした Claude Code 用モデル定義(ベースモデル名 `gemma4` とは別名にして上書きを回避)
- `bin/claude-with-ollama`: Claude Code を Ollama 向けの環境変数(`ANTHROPIC_BASE_URL` など)を付けて起動するスクリプト

`models/<名前>.modelfile` のファイル名(拡張子を除いた部分)が、そのまま `ollama create` / `--model` に使う Ollama モデル名になります。Ollama サーバーの起動、モデルの作成(`ollama create`)はこのフォルダのスクリプトでは行わず、手動で実行する前提です。

## 使い方

Ollama サーバーを起動していない場合は、別ターミナルで起動します(長いコンテキストを使う場合)。

```bash
OLLAMA_CONTEXT_LENGTH=64000 ollama serve
```

使いたい modelfile に対応する Ollama モデルを作成します(`default` は最低限これだけ作成しておけば引数なしで動きます)。

```bash
ollama create default -f .claude/llm-with-ollama/models/default.modelfile
```

Claude Code をローカル Ollama 経由で起動します(引数省略時は `models/default.modelfile` 由来の `default` モデルを使用)。

```bash
./.claude/llm-with-ollama/bin/claude-with-ollama
```

`--modelfile <名前>` で `models/<名前>.modelfile` (＝ Ollama モデル名 `<名前>`)を明示的に指定できます。事前に対応する Ollama モデルを作成しておく必要があります。

```bash
ollama create qwen3.5-9b -f .claude/llm-with-ollama/models/qwen3.5-9b.modelfile
./.claude/llm-with-ollama/bin/claude-with-ollama --modelfile qwen3.5-9b
```

`--modelfile` 以外の引数はそのまま Claude Code に渡せます。

```bash
./.claude/llm-with-ollama/bin/claude-with-ollama --modelfile qwen3.5-9b --dangerously-skip-permissions
```

存在しない modelfile を指定するとエラーで終了します。

```bash
./.claude/llm-with-ollama/bin/claude-with-ollama --modelfile typo-name
# error: modelfile not found: .../models/typo-name.modelfile
```

## モデル変更

デフォルトのベースモデルを変えたい場合は、`models/default.modelfile` の `FROM` を変更してから再作成します。

```bash
ollama create default -f .claude/llm-with-ollama/models/default.modelfile
```

例:

```text
FROM qwen3-coder:latest
```

### 別名のモデルを追加する

`models/<任意の名前>.modelfile` を新規作成し、同じ名前で `ollama create` すると、別の Ollama モデルを追加できます(既存の `default` には影響しません)。

```bash
cp .claude/llm-with-ollama/models/default.modelfile .claude/llm-with-ollama/models/qwen-coder.modelfile
# qwen-coder.modelfile の FROM 等を編集してから:
ollama create qwen-coder -f .claude/llm-with-ollama/models/qwen-coder.modelfile
```

使うときは `--modelfile` で切り替えます。

```bash
./.claude/llm-with-ollama/bin/claude-with-ollama --modelfile qwen-coder
```

## 確認

```bash
ollama list
ollama ps
```

`ollama ps` の `CONTEXT` が `64000` になっていれば、調査メモで推奨されている長いコンテキスト設定で動作しています。

## `models/*.modelfile` の設定例

ファイル名(拡張子を除いた部分)がそのまま Ollama モデル名になります。

Qwen 2.5 Coder 7B を使う場合:

```text
FROM qwen2.5-coder:7b

PARAMETER num_ctx 64000
PARAMETER temperature 0.2
PARAMETER top_p 0.9

SYSTEM """
You are a pragmatic programming assistant for Claude Code.
Prioritize correct tool use, small scoped edits, readable code, and verification with tests or commands.
When changing files, preserve the existing style and avoid unrelated refactors.
"""
```

Gemma 4 を使う場合(`models/gemma4.modelfile` として用意済み。ベースモデルと同名の `gemma4` を使うと `ollama create` でベースモデル自体を上書きしてしまうため、別名にしています):

```text
FROM gemma4:latest

PARAMETER num_ctx 64000
PARAMETER temperature 0.2
PARAMETER top_p 0.9

SYSTEM """
You are a pragmatic programming assistant for Claude Code.
Prioritize correct tool use, small scoped edits, readable code, and verification with tests or commands.
When changing files, preserve the existing style and avoid unrelated refactors.
"""
```

```bash
ollama create gemma4 -f .claude/llm-with-ollama/models/gemma4.modelfile
./.claude/llm-with-ollama/bin/claude-with-ollama --modelfile gemma4
```

設定を変更した後は、`ollama create <モデル名> -f <該当する modelfile>` で再作成します。

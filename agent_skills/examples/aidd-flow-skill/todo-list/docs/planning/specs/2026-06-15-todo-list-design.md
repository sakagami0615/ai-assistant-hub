# ToDo List Web Application Design

## Goal

Djangoを学習・検証できる小規模な個人向けToDoリストWebアプリケーションを構築する。

## Scope

- ログインなしでToDoを一覧表示する。
- タイトルを指定してToDoを追加する。
- ステータスを「未着手」「進行中」「完了」から選択して変更する。
- ToDoを削除する。
- SQLiteへ保存し、アプリケーション再起動後もデータを保持する。

編集、期限、優先度、複数ユーザー、REST API、非同期更新は対象外とする。

## Architecture

通常版公式イメージ`python:3.14`、Django、SQLite、uv、Docker Composeを使用する。Djangoプロジェクトに`todos`アプリを配置し、関数ベースビュー、Djangoフォーム、Djangoテンプレートで構成する。操作は通常のHTMLフォームからPOSTし、成功後は一覧へリダイレクトする。ホストへPython依存を導入せず、依存同期、サーバー、テスト、静的検査をコンテナ内で実行する。

## Domain Model

`Todo`はタイトル、ステータス、作成日時を持つ。ステータスは`NOT_STARTED`、`IN_PROGRESS`、`COMPLETED`のいずれかで、新規作成時は`NOT_STARTED`とする。タイトルは空白だけの値を許可しない。

## Components

- `Todo`モデル: SQLiteへToDoを永続化する。
- `TodoCreateForm`: タイトルを検証する。
- 一覧・追加ビュー: 一覧表示と新規登録を扱う。
- ステータス変更ビュー: 許可されたステータスへの変更を扱う。
- 削除ビュー: 指定されたToDoを削除する。
- 一覧テンプレート: 入力フォーム、空状態、ToDo一覧、ステータス選択、削除操作を表示する。
- `Dockerfile`: `python:3.14`へuvと依存関係を導入する。
- `compose.yaml`: ソースをマウントし、`${TODO_PORT:-8000}:8000`でホスト側の公開ポートを調整可能にし、名前付きボリュームを`/data`へ接続する。

## Data Flow

一覧のGETでは作成日時の新しい順にToDoを取得する。追加、ステータス変更、削除はPOSTのみ受け付ける。成功時はPost/Redirect/Getパターンで一覧へ戻す。存在しないToDoは404、不正なステータス値は400とする。

## Error Handling

空白のみのタイトルは同じ画面にフォームエラーを表示し、DBへ保存しない。DjangoのCSRF保護を有効にする。更新操作へのGETは405とする。

## Testing

Docker Compose内でDjango標準テストを使用し、モデルの既定値と選択肢、フォーム検証、一覧表示、追加、ステータス変更、削除、HTTPメソッド制約、404、400を検証する。テストケースを先に実装し、期待した理由で失敗することを確認してから最小実装を追加する。

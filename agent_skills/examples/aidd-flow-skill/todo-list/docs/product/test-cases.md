# テストケース

## テストケース一覧

| TC-ID | テストケース名 | 対象仕様 | 関数名 |
| --- | --- | --- | --- |
| TC-001 | 新規ToDoの既定ステータス | Todo.status | `test_new_todo_defaults_to_not_started` |
| TC-002 | 一覧の並び順 | 一覧表示 | `test_todos_are_ordered_newest_first` |
| TC-003 | 空状態の表示 | 一覧表示 | `test_list_shows_empty_state` |
| TC-004 | 有効なToDoの追加 | ToDo追加 | `test_create_todo_with_valid_title` |
| TC-005 | タイトル前後空白の除去 | ToDo追加 | `test_create_todo_strips_title` |
| TC-006 | 空白タイトルの拒否 | ToDo追加 | `test_create_todo_rejects_blank_title` |
| TC-007 | 200文字超タイトルの拒否 | ToDo追加 | `test_create_todo_rejects_title_over_200_characters` |
| TC-008 | ステータスの任意変更 | ステータス変更 | `test_update_todo_status` |
| TC-009 | 不正ステータスの拒否 | ステータス変更 | `test_update_todo_rejects_invalid_status` |
| TC-010 | 存在しないToDoの変更 | ステータス変更 | `test_update_missing_todo_returns_404` |
| TC-011 | ToDoの削除 | ToDo削除 | `test_delete_todo` |
| TC-012 | 存在しないToDoの削除 | ToDo削除 | `test_delete_missing_todo_returns_404` |
| TC-013 | 更新操作のPOST制約 | HTTPメソッド | `test_mutating_views_reject_get` |
| TC-014 | 更新操作のCSRF保護 | CSRF | `test_mutating_views_require_csrf` |

## TC-001: 新規ToDoの既定ステータス

### 対象仕様

新規ToDoのステータスは未着手である。

### テスト名 / 関数名

`TodoModelTests.test_new_todo_defaults_to_not_started`

### 入力パラメーター

`title="テストを書く"`

### 実行する内容

ステータスを指定せずにTodoを作成する。

### 期待結果

`status`が`Todo.Status.NOT_STARTED`である。

### 備考

なし。

## TC-002: 一覧の並び順

### 対象仕様

一覧は作成日時の新しい順で表示する。

### テスト名 / 関数名

`TodoListViewTests.test_todos_are_ordered_newest_first`

### 入力パラメーター

作成日時が異なる2件のToDo。

### 実行する内容

一覧をGETし、レスポンスのToDo順序を取得する。

### 期待結果

新しいToDoが古いToDoより先に並ぶ。

### 備考

なし。

## TC-003: 空状態の表示

### 対象仕様

0件の場合は空状態メッセージを表示する。

### テスト名 / 関数名

`TodoListViewTests.test_list_shows_empty_state`

### 入力パラメーター

ToDoなし。

### 実行する内容

一覧をGETする。

### 期待結果

HTTP 200で「ToDoはまだありません。」を含む。

### 備考

なし。

## TC-004: 有効なToDoの追加

### 対象仕様

有効なタイトルから未着手のToDoを追加する。

### テスト名 / 関数名

`TodoCreateViewTests.test_create_todo_with_valid_title`

### 入力パラメーター

`title="設計書を確認する"`

### 実行する内容

一覧URLへPOSTする。

### 期待結果

一覧へリダイレクトし、指定タイトルかつ未着手のToDoが1件保存される。

### 備考

なし。

## TC-005: タイトル前後空白の除去

### 対象仕様

タイトルは前後の空白を除去して保存する。

### テスト名 / 関数名

`TodoCreateViewTests.test_create_todo_strips_title`

### 入力パラメーター

`title="  設計書を確認する  "`

### 実行する内容

一覧URLへPOSTする。

### 期待結果

保存されたタイトルが「設計書を確認する」である。

### 備考

なし。

## TC-006: 空白タイトルの拒否

### 対象仕様

空白のみのタイトルは登録しない。

### テスト名 / 関数名

`TodoCreateViewTests.test_create_todo_rejects_blank_title`

### 入力パラメーター

`title="   "`

### 実行する内容

一覧URLへPOSTする。

### 期待結果

HTTP 200でフォームエラーを表示し、ToDo件数は0件のままである。

### 備考

なし。

## TC-007: 200文字超タイトルの拒否

### 対象仕様

タイトルは200文字以下とする。

### テスト名 / 関数名

`TodoCreateViewTests.test_create_todo_rejects_title_over_200_characters`

### 入力パラメーター

201文字のタイトル。

### 実行する内容

一覧URLへPOSTする。

### 期待結果

HTTP 200でフォームエラーを表示し、ToDoを保存しない。

### 備考

なし。

## TC-008: ステータスの任意変更

### 対象仕様

任意の許可ステータスへ変更できる。

### テスト名 / 関数名

`TodoStatusViewTests.test_update_todo_status`

### 入力パラメーター

未着手のToDo、`status="IN_PROGRESS"`。同様に3値をサブテストで検証する。

### 実行する内容

ステータス変更URLへPOSTする。

### 期待結果

一覧へリダイレクトし、指定したステータスが保存される。

### 備考

3状態間の遷移順序は制限しない。

## TC-009: 不正ステータスの拒否

### 対象仕様

定義外のステータスを拒否する。

### テスト名 / 関数名

`TodoStatusViewTests.test_update_todo_rejects_invalid_status`

### 入力パラメーター

既存ToDo、`status="UNKNOWN"`。

### 実行する内容

ステータス変更URLへPOSTする。

### 期待結果

HTTP 400を返し、DBのステータスは変更されない。

### 備考

なし。

## TC-010: 存在しないToDoの変更

### 対象仕様

存在しないToDoへのステータス変更は404を返す。

### テスト名 / 関数名

`TodoStatusViewTests.test_update_missing_todo_returns_404`

### 入力パラメーター

存在しないID、`status="COMPLETED"`。

### 実行する内容

ステータス変更URLへPOSTする。

### 期待結果

HTTP 404を返す。

### 備考

なし。

## TC-011: ToDoの削除

### 対象仕様

指定したToDoを削除する。

### テスト名 / 関数名

`TodoDeleteViewTests.test_delete_todo`

### 入力パラメーター

既存ToDoのID。

### 実行する内容

削除URLへPOSTする。

### 期待結果

一覧へリダイレクトし、対象ToDoがDBに存在しない。

### 備考

なし。

## TC-012: 存在しないToDoの削除

### 対象仕様

存在しないToDoへの削除は404を返す。

### テスト名 / 関数名

`TodoDeleteViewTests.test_delete_missing_todo_returns_404`

### 入力パラメーター

存在しないID。

### 実行する内容

削除URLへPOSTする。

### 期待結果

HTTP 404を返す。

### 備考

なし。

## TC-013: 更新操作のPOST制約

### 対象仕様

ステータス変更と削除はPOSTのみ許可する。

### テスト名 / 関数名

`TodoHttpBoundaryTests.test_mutating_views_reject_get`

### 入力パラメーター

既存ToDoのステータス変更URLと削除URL。

### 実行する内容

各URLへGETする。

### 期待結果

どちらもHTTP 405を返し、DBを変更しない。

### 備考

追加は一覧URLへのPOSTとして扱う。

## TC-014: 更新操作のCSRF保護

### 対象仕様

状態変更操作には有効なCSRFトークンを要求する。

### テスト名 / 関数名

`TodoHttpBoundaryTests.test_mutating_views_require_csrf`

### 入力パラメーター

CSRFチェックを有効化したクライアントと、トークンなしの追加・ステータス変更・削除POST。

### 実行する内容

各更新URLへPOSTする。

### 期待結果

各リクエストがHTTP 403を返し、DBを変更しない。

### 備考

Django標準ミドルウェアを使用する。


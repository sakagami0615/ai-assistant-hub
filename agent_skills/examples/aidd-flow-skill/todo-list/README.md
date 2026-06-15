# ToDo List

Python 3.14、Django、SQLiteで動作する個人向けToDoリストです。実行環境はDocker Compose内で完結します。

## 開発コマンド

```bash
docker compose build
docker compose up
```

ブラウザで <http://localhost:8000/> を開きます。SQLiteデータは`todo_data`名前付きボリュームに保存されます。

ホストの8000番ポートが使用中の場合は、`TODO_PORT`で公開ポートを変更できます。コンテナ内部のポートは8000のままです。

```bash
TODO_PORT=8080 docker compose up
```

この場合は <http://localhost:8080/> を開きます。

## 同じネットワーク内のPCから開く

Djangoは初期状態では`localhost`と`127.0.0.1`へのアクセスだけを許可します。別のPCからIPアドレスで開く場合は、サイトを動かすPCのIPアドレスを`DJANGO_ALLOWED_HOSTS`へ指定します。

```bash
DJANGO_ALLOWED_HOSTS=192.168.1.10 TODO_PORT=8080 docker compose up
```

別のPCのブラウザから <http://192.168.1.10:8080/> を開きます。`192.168.1.10`は、実際にサイトを動かすPCのIPアドレスへ置き換えてください。

複数のIPアドレスやホスト名を許可する場合は、カンマで区切ります。

```bash
DJANGO_ALLOWED_HOSTS=192.168.1.10,todo-pc.local docker compose up
```

```bash
docker compose run --rm web uv run python manage.py test
docker compose run --rm web uv run ruff check .
docker compose down
```

---
id: ADR-005
title: TODO の削除はソフトデリートにする
owner: sample-user
date: 2026-07-10
scope: todos
source: human
supersedes:
---

# ADR-005 TODO の削除はソフトデリートにする

## 決定

TODO を削除するときは `deleted_at` を入れるソフトデリートにする。

## 理由

誤削除を利用者が戻せるようにしたいため。

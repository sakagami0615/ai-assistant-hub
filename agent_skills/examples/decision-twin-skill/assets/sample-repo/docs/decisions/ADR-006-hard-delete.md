---
id: ADR-006
title: TODO の削除は物理削除にする
owner: sample-user
date: 2026-07-12
scope: todos
source: human
supersedes:
---

# ADR-006 TODO の削除は物理削除にする

## 決定

TODO を削除するときは、レコードを物理削除する。

## 理由

個人情報を含む TODO を確実に消すため。

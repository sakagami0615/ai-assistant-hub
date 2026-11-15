---
id: ADR-002
title: 一覧 API は offset ページネーションにする
owner: sample-user
date: 2026-06-10
scope: api/public
source: human
supersedes:
---

# ADR-002 一覧 API は offset ページネーションにする

## 決定

一覧 API は `?offset=&limit=` の offset ページネーションにする。

## 理由

実装が簡単なため。

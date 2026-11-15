---
id: ADR-004
title: 一覧 API は cursor ページネーションにする
owner: sample-user
date: 2026-07-01
scope: api/public
source: human
supersedes: ADR-002
---

# ADR-004 一覧 API は cursor ページネーションにする

## 決定

一覧 API は cursor ページネーションにする。offset 方式（ADR-002）は廃止する。

## 理由

件数が増えたときに offset 方式では遅く、重複・欠落も起きたため。

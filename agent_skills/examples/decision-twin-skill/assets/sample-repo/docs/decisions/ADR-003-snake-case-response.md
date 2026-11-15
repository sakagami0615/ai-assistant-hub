---
id: ADR-003
title: 公開 API のレスポンスは snake_case にする
owner: sample-user
date: 2026-06-12
scope: api/public
source: human
supersedes:
---

# ADR-003 公開 API のレスポンスは snake_case にする

## 決定

公開 API の JSON のキーは snake_case にする。

## 理由

外部の利用者がすでに snake_case 前提で連携しており、互換性を崩したくないため。

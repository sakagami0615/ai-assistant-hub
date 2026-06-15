from django.test import TestCase

from todos.forms import TodoCreateForm


class TodoCreateFormTests(TestCase):
    def test_accepts_valid_title(self):
        form = TodoCreateForm({"title": "設計書を確認する"})

        self.assertTrue(form.is_valid())

    def test_strips_surrounding_whitespace(self):
        form = TodoCreateForm({"title": "  設計書を確認する  "})

        self.assertTrue(form.is_valid())
        self.assertEqual(form.cleaned_data["title"], "設計書を確認する")

    def test_rejects_whitespace_only_title(self):
        form = TodoCreateForm({"title": "   "})

        self.assertFalse(form.is_valid())
        self.assertIn("タイトルを入力してください。", form.errors["title"])

    def test_rejects_title_over_200_characters(self):
        form = TodoCreateForm({"title": "あ" * 201})

        self.assertFalse(form.is_valid())

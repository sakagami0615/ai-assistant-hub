from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from todos.models import Todo


class TodoListViewTests(TestCase):
    def test_list_returns_200(self):
        response = self.client.get(reverse("todos:list"))

        self.assertEqual(response.status_code, 200)

    def test_list_shows_empty_state(self):
        response = self.client.get(reverse("todos:list"))

        self.assertContains(response, "ToDoはまだありません。")

    def test_todos_are_ordered_newest_first(self):
        old = Todo.objects.create(title="古いToDo")
        new = Todo.objects.create(title="新しいToDo")
        Todo.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(days=1)
        )

        response = self.client.get(reverse("todos:list"))

        self.assertEqual(list(response.context["todos"]), [new, old])

    def test_list_shows_all_status_choices(self):
        Todo.objects.create(title="状態を確認する")

        response = self.client.get(reverse("todos:list"))

        for label in ("未着手", "進行中", "完了"):
            self.assertContains(response, label)


class TodoCreateViewTests(TestCase):
    def test_create_todo_with_valid_title(self):
        response = self.client.post(
            reverse("todos:list"), {"title": "設計書を確認する"}
        )

        self.assertRedirects(response, reverse("todos:list"))
        todo = Todo.objects.get()
        self.assertEqual(todo.title, "設計書を確認する")
        self.assertEqual(todo.status, Todo.Status.NOT_STARTED)

    def test_create_todo_strips_title(self):
        self.client.post(reverse("todos:list"), {"title": "  設計書を確認する  "})

        self.assertEqual(Todo.objects.get().title, "設計書を確認する")

    def test_create_todo_rejects_blank_title(self):
        response = self.client.post(reverse("todos:list"), {"title": "   "})

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "タイトルを入力してください。")
        self.assertFalse(Todo.objects.exists())

    def test_create_todo_rejects_title_over_200_characters(self):
        response = self.client.post(reverse("todos:list"), {"title": "あ" * 201})

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.context["form"].errors)
        self.assertFalse(Todo.objects.exists())

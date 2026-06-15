from django.test import TestCase
from django.urls import reverse

from todos.models import Todo


class TodoStatusViewTests(TestCase):
    def test_update_todo_status(self):
        for status in Todo.Status.values:
            with self.subTest(status=status):
                todo = Todo.objects.create(title=f"{status}へ変更")

                response = self.client.post(
                    reverse("todos:update_status", args=[todo.pk]),
                    {"status": status},
                )

                self.assertRedirects(response, reverse("todos:list"))
                todo.refresh_from_db()
                self.assertEqual(todo.status, status)

    def test_update_todo_rejects_invalid_status(self):
        todo = Todo.objects.create(title="状態を保つ")

        response = self.client.post(
            reverse("todos:update_status", args=[todo.pk]),
            {"status": "UNKNOWN"},
        )

        self.assertEqual(response.status_code, 400)
        todo.refresh_from_db()
        self.assertEqual(todo.status, Todo.Status.NOT_STARTED)

    def test_update_missing_todo_returns_404(self):
        response = self.client.post(
            reverse("todos:update_status", args=[9999]),
            {"status": Todo.Status.COMPLETED},
        )

        self.assertEqual(response.status_code, 404)

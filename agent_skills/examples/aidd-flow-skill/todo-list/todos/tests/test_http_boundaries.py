from django.test import Client, TestCase
from django.urls import reverse

from todos.models import Todo


class TodoHttpBoundaryTests(TestCase):
    def test_mutating_views_reject_get(self):
        todo = Todo.objects.create(title="変更しない")

        status_response = self.client.get(
            reverse("todos:update_status", args=[todo.pk])
        )
        delete_response = self.client.get(reverse("todos:delete", args=[todo.pk]))

        self.assertEqual(status_response.status_code, 405)
        self.assertEqual(delete_response.status_code, 405)
        self.assertTrue(Todo.objects.filter(pk=todo.pk).exists())

    def test_mutating_views_require_csrf(self):
        client = Client(enforce_csrf_checks=True)
        todo = Todo.objects.create(title="変更しない")

        create_response = client.post(reverse("todos:list"), {"title": "追加"})
        status_response = client.post(
            reverse("todos:update_status", args=[todo.pk]),
            {"status": Todo.Status.COMPLETED},
        )
        delete_response = client.post(reverse("todos:delete", args=[todo.pk]))

        self.assertEqual(create_response.status_code, 403)
        self.assertEqual(status_response.status_code, 403)
        self.assertEqual(delete_response.status_code, 403)
        todo.refresh_from_db()
        self.assertEqual(todo.status, Todo.Status.NOT_STARTED)
        self.assertEqual(Todo.objects.count(), 1)

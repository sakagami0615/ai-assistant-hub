from django.test import TestCase
from django.urls import reverse

from todos.models import Todo


class TodoDeleteViewTests(TestCase):
    def test_delete_todo(self):
        todo = Todo.objects.create(title="削除する")

        response = self.client.post(reverse("todos:delete", args=[todo.pk]))

        self.assertRedirects(response, reverse("todos:list"))
        self.assertFalse(Todo.objects.filter(pk=todo.pk).exists())

    def test_delete_missing_todo_returns_404(self):
        response = self.client.post(reverse("todos:delete", args=[9999]))

        self.assertEqual(response.status_code, 404)

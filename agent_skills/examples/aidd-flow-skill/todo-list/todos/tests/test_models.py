from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from todos.models import Todo


class TodoModelTests(TestCase):
    def test_new_todo_defaults_to_not_started(self):
        todo = Todo.objects.create(title="テストを書く")

        self.assertEqual(todo.status, Todo.Status.NOT_STARTED)

    def test_string_representation_is_title(self):
        todo = Todo(title="テストを書く")

        self.assertEqual(str(todo), "テストを書く")

    def test_todos_are_ordered_newest_first(self):
        old = Todo.objects.create(title="古いToDo")
        new = Todo.objects.create(title="新しいToDo")
        Todo.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(days=1)
        )

        self.assertEqual(list(Todo.objects.all()), [new, old])

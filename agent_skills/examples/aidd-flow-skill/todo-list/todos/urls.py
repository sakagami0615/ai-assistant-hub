from django.urls import path

from . import views

app_name = "todos"

urlpatterns = [
    path("", views.todo_list, name="list"),
    path("todos/<int:todo_id>/status/", views.update_status, name="update_status"),
    path("todos/<int:todo_id>/delete/", views.delete_todo, name="delete"),
]

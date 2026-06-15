from django.http import HttpResponseBadRequest
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from .forms import TodoCreateForm
from .models import Todo


def todo_list(request):
    if request.method == "POST":
        form = TodoCreateForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect("todos:list")
    else:
        form = TodoCreateForm()

    return render(
        request,
        "todos/todo_list.html",
        {
            "form": form,
            "todos": Todo.objects.all(),
            "status_choices": Todo.Status.choices,
        },
    )


@require_POST
def update_status(request, todo_id):
    todo = get_object_or_404(Todo, pk=todo_id)
    status = request.POST.get("status")
    if status not in Todo.Status.values:
        return HttpResponseBadRequest("不正なステータスです。")

    todo.status = status
    todo.save(update_fields=["status"])
    return redirect("todos:list")


@require_POST
def delete_todo(request, todo_id):
    todo = get_object_or_404(Todo, pk=todo_id)
    todo.delete()
    return redirect("todos:list")

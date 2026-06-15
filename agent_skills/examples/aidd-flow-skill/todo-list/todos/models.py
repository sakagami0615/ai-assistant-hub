from django.db import models


class Todo(models.Model):
    class Status(models.TextChoices):
        NOT_STARTED = "NOT_STARTED", "未着手"
        IN_PROGRESS = "IN_PROGRESS", "進行中"
        COMPLETED = "COMPLETED", "完了"

    title = models.CharField("タイトル", max_length=200)
    status = models.CharField(
        "ステータス",
        max_length=20,
        choices=Status.choices,
        default=Status.NOT_STARTED,
    )
    created_at = models.DateTimeField("作成日時", auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

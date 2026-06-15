from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Todo",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("title", models.CharField(max_length=200, verbose_name="タイトル")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("NOT_STARTED", "未着手"),
                            ("IN_PROGRESS", "進行中"),
                            ("COMPLETED", "完了"),
                        ],
                        default="NOT_STARTED",
                        max_length=20,
                        verbose_name="ステータス",
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True, verbose_name="作成日時"),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]

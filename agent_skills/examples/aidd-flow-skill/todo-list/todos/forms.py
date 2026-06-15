from django import forms
from django.core.exceptions import ValidationError

from .models import Todo


class TodoCreateForm(forms.ModelForm):
    title = forms.CharField(
        label="タイトル",
        max_length=200,
        required=False,
        widget=forms.TextInput(
            attrs={
                "autocomplete": "off",
                "placeholder": "新しいToDoを入力",
            }
        ),
    )

    class Meta:
        model = Todo
        fields = ["title"]

    def clean_title(self):
        title = self.cleaned_data["title"].strip()
        if not title:
            raise ValidationError("タイトルを入力してください。")
        return title

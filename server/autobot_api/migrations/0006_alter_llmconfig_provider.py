from django.db import migrations, models


class Migration(migrations.Migration):
    """Add the `nvidia_nim` provider choice to LLMConfig.

    Choices are validated in Python (serializer/forms), not by a database
    constraint, so this is a no-op at the DB level — it exists to keep the
    migration graph in sync with the model.
    """

    dependencies = [
        ('autobot_api', '0005_docchunk'),
    ]

    operations = [
        migrations.AlterField(
            model_name='llmconfig',
            name='provider',
            field=models.CharField(choices=[('gemini', 'Gemini'), ('groq', 'Groq'), ('openrouter', 'OpenRouter'), ('anthropic', 'Anthropic'), ('openai', 'OpenAI'), ('azure_openai', 'Azure OpenAI'), ('nvidia_nim', 'NVIDIA NIM'), ('custom', 'Custom (LiteLLM-compatible)')], max_length=32),
        ),
    ]

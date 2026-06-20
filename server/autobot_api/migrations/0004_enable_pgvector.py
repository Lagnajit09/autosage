from django.db import migrations


class Migration(migrations.Migration):
    """Enable the pgvector extension before any VectorField column is created.

    Idempotent: `IF NOT EXISTS` no-ops if the extension was already enabled
    out-of-band (e.g. via the Supabase dashboard), so it is safe to also enable
    it there first to avoid a privilege failure during the container's startup
    `migrate --noinput`. Kept in VCS so fresh / local DBs provision it
    automatically. Must run BEFORE the DocChunk migration that adds the vector
    column (that migration depends on this one).
    """

    dependencies = [
        ("autobot_api", "0003_message_is_byo"),
    ]

    operations = [
        migrations.RunSQL(
            sql="CREATE EXTENSION IF NOT EXISTS vector;",
            reverse_sql="DROP EXTENSION IF EXISTS vector;",
        ),
    ]

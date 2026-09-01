"""Create a personal API key for a user (for the sagex CLI, etc.).

Usage:
    python manage.py create_api_key --user <clerk_sub> [--name "cli on laptop"]
    python manage.py create_api_key --list        # list users to find your sub

Users are identified by ``username`` (which equals the Clerk ``sub``). The
plaintext key is printed exactly ONCE and never stored — copy it immediately.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from users.models import ApiKey

User = get_user_model()


class Command(BaseCommand):
    help = "Create an API key for a user (prints the plaintext once)."

    def add_arguments(self, parser):
        parser.add_argument('--user', help='Target user (username == Clerk sub).')
        parser.add_argument('--name', default='', help='Optional label for the key.')
        parser.add_argument('--list', action='store_true', help='List users and exit.')

    def handle(self, *args, **options):
        if options['list']:
            self._list_users()
            return

        user = self._resolve_user(options.get('user'))
        api_key, plaintext = ApiKey.create_for_user(user, name=options['name'])

        self.stdout.write(self.style.SUCCESS('API key created.'))
        self.stdout.write(f'  user : {user.username}')
        self.stdout.write(f'  id   : {api_key.id}')
        self.stdout.write(f'  name : {api_key.name or "(none)"}')
        self.stdout.write('')
        self.stdout.write(self.style.WARNING('Copy this key now — it will not be shown again:'))
        self.stdout.write('')
        self.stdout.write(f'    {plaintext}')
        self.stdout.write('')

    def _resolve_user(self, username):
        if username:
            try:
                return User.objects.get(username=username)
            except User.DoesNotExist:
                raise CommandError(
                    f"No user with username (Clerk sub) '{username}'. "
                    "Run with --list to see available users."
                )
        # No --user given: allow it only when there's exactly one user (local dev).
        users = list(User.objects.all()[:2])
        if len(users) == 1:
            self.stdout.write(f"No --user given; using the only user: {users[0].username}")
            return users[0]
        raise CommandError(
            "Specify --user <clerk_sub> (multiple or no users exist). "
            "Run with --list to see them."
        )

    def _list_users(self):
        users = User.objects.all().order_by('date_joined')
        if not users:
            self.stdout.write("No users found.")
            return
        self.stdout.write("Users (username == Clerk sub):")
        for u in users:
            state = 'active' if u.is_active else 'inactive'
            self.stdout.write(f"  - {u.username}   [{state}]")

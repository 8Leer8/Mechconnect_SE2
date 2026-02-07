from django.apps import AppConfig


class UsersConfig(AppConfig):
    name = 'users'
    
    def ready(self):
        """
        Import signal handlers when Django starts.
        This ensures signals are registered and active.
        """
        import users.signals  # noqa: F401

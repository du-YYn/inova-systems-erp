from django.apps import AppConfig


class ProjectsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'projects'
    verbose_name = 'Projetos'

    def ready(self):
        # v32 F5: receivers dos eventos cross-setor (LegalCase assinado etc.)
        import projects.receivers  # noqa: F401

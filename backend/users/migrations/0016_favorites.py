from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("shops", "0002_shopmechanic_is_active"),
        ("users", "0015_shopowner_tokens_balance"),
    ]

    operations = [
        migrations.CreateModel(
            name="FavoriteMechanic",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("client", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="favorite_mechanics", to="users.client")),
                ("mechanic", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="favorited_by_clients", to="users.mechanic")),
            ],
            options={
                "ordering": ["-created_at"],
                "unique_together": {("client", "mechanic")},
            },
        ),
        migrations.CreateModel(
            name="FavoriteShop",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("client", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="favorite_shops", to="users.client")),
                ("shop", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="favorited_by_clients", to="shops.shop")),
            ],
            options={
                "ordering": ["-created_at"],
                "unique_together": {("client", "shop")},
            },
        ),
    ]

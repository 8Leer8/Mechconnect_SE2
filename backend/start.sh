#!/usr/bin/env bash
python manage.py migrate
python manage.py collectstatic --noinput
daphne -b 0.0.0.0 -p $PORT MainBackend.asgi:application
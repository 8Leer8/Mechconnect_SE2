import json
import os
from django.core.management.base import BaseCommand
from vehicles.models import VehicleType, VehicleBrand, VehicleModel


class Command(BaseCommand):
    help = 'Seed vehicle data from ph_vehicles_complete.json'

    def add_arguments(self, parser):
        parser.add_argument(
            '--json-path',
            type=str,
            default=None,
            help='Path to ph_vehicles_complete.json file',
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing vehicle data before seeding',
        )

    def handle(self, *args, **options):
        json_path = options['json_path']
        clear_data = options['clear']

        # Determine JSON file path
        if not json_path:
            # Try to find the file in common locations
            possible_paths = [
                os.path.join('..', 'frontend-mobile', 'assets', 'json', 'ph_vehicles_complete.json'),
                os.path.join('..', '..', 'frontend-mobile', 'assets', 'json', 'ph_vehicles_complete.json'),
                os.path.join('frontend-mobile', 'assets', 'json', 'ph_vehicles_complete.json'),
                'ph_vehicles_complete.json',
            ]
            for path in possible_paths:
                if os.path.exists(path):
                    json_path = path
                    break

        if not json_path or not os.path.exists(json_path):
            self.stderr.write(
                self.style.ERROR(
                    f'Could not find ph_vehicles_complete.json. '
                    f'Please provide the path using --json-path'
                )
            )
            return

        self.stdout.write(f'Loading data from: {json_path}')

        # Clear existing data if requested
        if clear_data:
            self.stdout.write('Clearing existing vehicle data...')
            VehicleModel.objects.all().delete()
            VehicleBrand.objects.all().delete()
            VehicleType.objects.all().delete()
            self.stdout.write(self.style.SUCCESS('Existing data cleared.'))

        # Load JSON data
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        vehicle_types = data.get('vehicle_types', [])
        total_types = len(vehicle_types)
        total_brands = 0
        total_models = 0

        self.stdout.write(f'Found {total_types} vehicle types to process...')

        for type_data in vehicle_types:
            type_name = type_data.get('type')
            if not type_name:
                continue

            # Create or get VehicleType
            vehicle_type, created = VehicleType.objects.get_or_create(
                name__iexact=type_name,
                defaults={'name': type_name}
            )
            action = 'Created' if created else 'Found'
            self.stdout.write(f'  {action} type: {type_name}')

            # Process brands
            brands = type_data.get('brands', [])
            for brand_data in brands:
                brand_name = brand_data.get('name')
                if not brand_name:
                    continue

                # Create or get VehicleBrand
                brand, created = VehicleBrand.objects.get_or_create(
                    type=vehicle_type,
                    name__iexact=brand_name,
                    defaults={'name': brand_name}
                )
                total_brands += 1 if created else 0

                # Process models - handle both flat array and nested subcategories
                models_data = brand_data.get('models', [])
                
                if isinstance(models_data, list):
                    # Flat array of model names (Car structure)
                    for model_name in models_data:
                        if isinstance(model_name, str):
                            model, created = VehicleModel.objects.get_or_create(
                                brand=brand,
                                name__iexact=model_name,
                                subcategory=None,
                                defaults={'name': model_name, 'subcategory': None}
                            )
                            total_models += 1 if created else 0
                        elif isinstance(model_name, dict):
                            # Some models might be objects with name/subcategory
                            name = model_name.get('name')
                            subcategory = model_name.get('subcategory')
                            if name:
                                model, created = VehicleModel.objects.get_or_create(
                                    brand=brand,
                                    name__iexact=name,
                                    subcategory__iexact=subcategory,
                                    defaults={'name': name, 'subcategory': subcategory}
                                )
                                total_models += 1 if created else 0

                elif isinstance(models_data, dict):
                    # Nested by subcategory (Motorcycle structure)
                    for subcategory, model_list in models_data.items():
                        if not isinstance(model_list, list):
                            continue
                        for model_name in model_list:
                            if isinstance(model_name, str):
                                model, created = VehicleModel.objects.get_or_create(
                                    brand=brand,
                                    name__iexact=model_name,
                                    subcategory__iexact=subcategory,
                                    defaults={'name': model_name, 'subcategory': subcategory}
                                )
                                total_models += 1 if created else 0
                            elif isinstance(model_name, dict):
                                name = model_name.get('name')
                                if name:
                                    model, created = VehicleModel.objects.get_or_create(
                                        brand=brand,
                                        name__iexact=name,
                                        subcategory__iexact=subcategory,
                                        defaults={'name': name, 'subcategory': subcategory}
                                    )
                                    total_models += 1 if created else 0

        self.stdout.write(self.style.SUCCESS(
            f'\nSeeding complete! '
            f'{total_types} types, '
            f'{total_brands} brands, '
            f'{total_models} models created.'
        ))

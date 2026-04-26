import json

from django.test import Client as DjangoClient
from django.test import TestCase

from services.models import MechanicService, Service, ServiceAddOn
from users.models import Account, Client, Mechanic

from .models import DirectRequest, DirectRequestAddOn


class MechanicDirectRequestAddonTests(TestCase):
	def setUp(self):
		self.http_client = DjangoClient()

		self.client_account = Account.objects.create(
			firstname='Client',
			lastname='User',
			username='client-user',
			email='client@example.com',
			password='password',
		)
		Client.objects.create(account=self.client_account, contact_number='09170000001')

		self.mechanic_account = Account.objects.create(
			firstname='Mechanic',
			lastname='Owner',
			username='mechanic-owner',
			email='mechanic@example.com',
			password='password',
		)
		self.mechanic = Mechanic.objects.create(account=self.mechanic_account, contact_number='09170000002')

		self.unavailable_mechanic_account = Account.objects.create(
			firstname='Unavailable',
			lastname='Mechanic',
			username='mechanic-unavailable',
			email='mechanic-unavailable@example.com',
			password='password',
		)
		self.unavailable_mechanic = Mechanic.objects.create(
			account=self.unavailable_mechanic_account,
			contact_number='09170000003',
			status=Mechanic.WorkStatus.WORKING,
		)

		self.service = Service.objects.create(
			name='Oil Change',
			description='Basic oil change service',
			minimum_price=150,
		)
		MechanicService.objects.create(mechanic=self.mechanic, service=self.service, price=200)
		MechanicService.objects.create(mechanic=self.unavailable_mechanic, service=self.service, price=220)

		self.mechanic_addon = ServiceAddOn.objects.create(
			mechanic=self.mechanic,
			service=self.service,
			name='Engine Flush',
			description='Flush and clean the engine oil passages',
			price=50,
		)
		self.global_addon = ServiceAddOn.objects.create(
			service=self.service,
			name='Legacy Global Add-on',
			description='Legacy row that should not appear for this mechanic',
			price=75,
		)

	def test_mechanic_service_addons_endpoint_excludes_global_addons(self):
		response = self.http_client.get(
			f'/api/bookings/direct/services/{self.service.id}/addons/?provider_id={self.mechanic_account.id}'
		)

		self.assertEqual(response.status_code, 200)
		payload = json.loads(response.content)
		addon_ids = {addon['id'] for addon in payload['add_ons']}

		self.assertIn(self.mechanic_addon.id, addon_ids)
		self.assertNotIn(self.global_addon.id, addon_ids)

	def test_mechanic_services_endpoint_excludes_global_addons(self):
		response = self.http_client.get(
			f'/api/bookings/direct/mechanics/{self.mechanic_account.id}/services/'
		)

		self.assertEqual(response.status_code, 200)
		payload = json.loads(response.content)
		service = payload['services'][0]
		addon_ids = {addon['id'] for addon in service['add_ons']}

		self.assertIn(self.mechanic_addon.id, addon_ids)
		self.assertNotIn(self.global_addon.id, addon_ids)

	def test_mechanic_direct_request_rejects_global_addons(self):
		session = self.http_client.session
		session['account_id'] = self.client_account.id
		session.save()

		response = self.http_client.post(
			'/api/bookings/direct/mechanic/create/',
			data=json.dumps({
				'provider_id': self.mechanic_account.id,
				'service_id': self.service.id,
				'add_on_ids': [self.global_addon.id],
				'vehicle_type': 'Car',
				'vehicle_brand': 'Toyota',
				'vehicle_model': 'Vios',
				'service_location': {
					'street_name': 'Main St',
					'barangay': 'Barangay 1',
					'city_municipality': 'Metro City',
					'latitude': 14.5995,
					'longitude': 120.9842,
				},
			}),
			content_type='application/json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertEqual(DirectRequest.objects.count(), 0)
		self.assertEqual(DirectRequestAddOn.objects.count(), 0)

	def test_mechanic_direct_request_accepts_mechanic_owned_addons(self):
		session = self.http_client.session
		session['account_id'] = self.client_account.id
		session.save()

		response = self.http_client.post(
			'/api/bookings/direct/mechanic/create/',
			data=json.dumps({
				'provider_id': self.mechanic_account.id,
				'service_id': self.service.id,
				'add_on_ids': [self.mechanic_addon.id],
				'vehicle_type': 'Car',
				'vehicle_brand': 'Toyota',
				'vehicle_model': 'Vios',
				'service_location': {
					'street_name': 'Main St',
					'barangay': 'Barangay 1',
					'city_municipality': 'Metro City',
					'latitude': 14.5995,
					'longitude': 120.9842,
				},
			}),
			content_type='application/json',
		)

		self.assertEqual(response.status_code, 201)
		self.assertEqual(DirectRequest.objects.count(), 1)
		self.assertEqual(DirectRequestAddOn.objects.count(), 1)
		self.assertEqual(DirectRequestAddOn.objects.first().service_add_on_id, self.mechanic_addon.id)

	def test_mechanic_direct_request_rejects_unavailable_mechanic(self):
		session = self.http_client.session
		session['account_id'] = self.client_account.id
		session.save()

		response = self.http_client.post(
			'/api/bookings/direct/mechanic/create/',
			data=json.dumps({
				'provider_id': self.unavailable_mechanic_account.id,
				'service_id': self.service.id,
				'vehicle_type': 'Car',
				'vehicle_brand': 'Toyota',
				'vehicle_model': 'Vios',
				'service_location': {
					'street_name': 'Main St',
					'barangay': 'Barangay 1',
					'city_municipality': 'Metro City',
					'latitude': 14.5995,
					'longitude': 120.9842,
				},
			}),
			content_type='application/json',
		)

		self.assertEqual(response.status_code, 409)
		self.assertEqual(DirectRequest.objects.count(), 0)

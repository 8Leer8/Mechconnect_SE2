import json
from decimal import Decimal

from django.test import Client as DjangoClient
from django.test import TestCase

from services.models import MechanicService, Service, ServiceAddOn
from pricing.models import PricingConfiguration
from shops.models import Shop, ShopMechanic
from users.models import Account, Client, Mechanic, ShopOwner, Wallet

from .models import (
	Backjob,
	Booking,
	DirectRequest,
	DirectRequestAddOn,
	DirectRequestServiceLine,
	Quotation,
	QuotationItem,
	Request,
	RequestAssignment,
	ServiceLocation,
)


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

		self.service_two = Service.objects.create(
			name='Brake Inspection',
			description='Check brakes',
			minimum_price=100,
		)
		MechanicService.objects.create(mechanic=self.mechanic, service=self.service_two, price=300)

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

	def test_mechanic_direct_request_accepts_service_lines_multi_service(self):
		session = self.http_client.session
		session['account_id'] = self.client_account.id
		session.save()

		response = self.http_client.post(
			'/api/bookings/direct/mechanic/create/',
			data=json.dumps({
				'provider_id': self.mechanic_account.id,
				'service_lines': [
					{'service_id': self.service.id, 'add_on_ids': [self.mechanic_addon.id]},
					{'service_id': self.service_two.id, 'add_on_ids': []},
				],
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
		payload = json.loads(response.content)
		self.assertAlmostEqual(payload['total_amount'], 550.0)

		new_req = Request.objects.order_by('-id').first()
		self.assertEqual(DirectRequestServiceLine.objects.filter(request=new_req).count(), 2)
		self.assertEqual(DirectRequestAddOn.objects.filter(request=new_req).count(), 1)
		dr = DirectRequest.objects.get(request=new_req)
		self.assertEqual(dr.service_id, self.service.id)

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


class ShopBookingSplitPaymentTests(TestCase):
	def setUp(self):
		self.http_client = DjangoClient()
		PricingConfiguration.objects.update_or_create(
			pk=1,
			defaults={
				'platform_commission_percentage': Decimal('10.00'),
				'disbursement_fee': Decimal('0.00'),
			},
		)

		self.client_account = self._account('client-split')
		self.client = Client.objects.create(account=self.client_account, contact_number='09170001001')
		self._set_wallet_balance(self.client_account, Decimal('5000.00'))

		self.shop_owner_account = self._account('shop-owner-split')
		self.shop_owner = ShopOwner.objects.create(
			account=self.shop_owner_account,
			contact_number='09170001002',
			verification_status=ShopOwner.VerificationStatus.APPROVED,
			owns_shop=True,
		)
		self._set_wallet_balance(self.shop_owner_account, Decimal('0.00'))
		self.shop = Shop.objects.create(
			shop_owner=self.shop_owner,
			shop_name='Split Test Shop',
			contact_number='09170001002',
			email='split-shop@example.com',
			is_verified=True,
		)

		self.lead_account, self.lead_mechanic = self._mechanic('lead-split')
		self.assist_account, self.assist_mechanic = self._mechanic('assist-split')
		self._set_wallet_balance(self.lead_account, Decimal('0.00'))
		self._set_wallet_balance(self.assist_account, Decimal('0.00'))
		ShopMechanic.objects.create(shop=self.shop, mechanic=self.lead_mechanic)
		ShopMechanic.objects.create(shop=self.shop, mechanic=self.assist_mechanic)

		self.service = Service.objects.create(
			name='Diagnostic',
			description='Check vehicle issue',
			minimum_price=Decimal('1000.00'),
		)

	def _account(self, username):
		return Account.objects.create(
			firstname=username,
			lastname='User',
			username=username,
			email=f'{username}@example.com',
			password='password',
		)

	def _set_wallet_balance(self, account, balance):
		wallet, _ = Wallet.objects.get_or_create(account=account)
		wallet.balance = balance
		wallet.save(update_fields=['balance'])
		return wallet

	def _mechanic(self, username):
		account = self._account(username)
		mechanic = Mechanic.objects.create(
			account=account,
			contact_number='09170009999',
			verification_status=Mechanic.VerificationStatus.APPROVED,
			is_working_for_shop=True,
			shop=self.shop,
		)
		return account, mechanic

	def _shop_booking(self, amount=Decimal('1000.00'), status=Booking.Status.PENDING_PAYMENT):
		location = ServiceLocation.objects.create(
			street_name='Main St',
			barangay='Barangay 1',
			city_municipality='Metro City',
		)
		request = Request.objects.create(
			client=self.client,
			provider=self.lead_account,
			shop=self.shop,
			request_type=Request.Type.DIRECT,
			service_location=location,
			vehicle_type='Car',
			vehicle_brand='Toyota',
			vehicle_model='Vios',
		)
		DirectRequest.objects.create(request=request, service=self.service, request_status=DirectRequest.Status.ACCEPTED)
		RequestAssignment.objects.create(request=request, mechanic=self.lead_account, role=RequestAssignment.Role.LEAD)
		RequestAssignment.objects.create(request=request, mechanic=self.assist_account, role=RequestAssignment.Role.ASSISTANT)
		booking = Booking.objects.create(
			request=request,
			status=status,
			amount_fee=amount,
			convenience_fee=Decimal('0.00'),
		)
		return booking

	def _login_as(self, account):
		session = self.http_client.session
		session['account_id'] = account.id
		session.save()

	def test_shopowner_pending_payment_detail_has_pricing_split_and_team(self):
		booking = self._shop_booking()
		quotation = Quotation.objects.create(
			booking=booking,
			mechanic=self.lead_account,
			status=Quotation.Status.ACCEPTED,
			total_amount=Decimal('1000.00'),
			is_final=True,
		)
		QuotationItem.objects.create(
			quotation=quotation,
			line_kind=QuotationItem.LineKind.SERVICE,
			service=self.service,
			description='Diagnostic',
			quantity=1,
			unit_price=Decimal('1000.00'),
			status=Quotation.Status.ACCEPTED,
		)

		self._login_as(self.shop_owner_account)
		response = self.http_client.get(f'/api/bookings/shopowner/bookings/{booking.id}/')

		self.assertEqual(response.status_code, 200)
		payload = json.loads(response.content)
		booking_payload = payload['booking']
		self.assertEqual(booking_payload['status'], Booking.Status.PENDING_PAYMENT)
		self.assertEqual(len(booking_payload['request']['assigned_mechanics']), 2)
		self.assertEqual(booking_payload['payment_split']['shop_owner_amount'], 100.0)
		self.assertEqual(booking_payload['payment_split']['mechanic_amount'], 900.0)
		self.assertEqual(booking_payload['payment_split']['mechanic_count'], 2)
		self.assertEqual(booking_payload['payment_summary']['remaining_balance'], 1000.0)

	def test_credits_payment_splits_shop_booking_between_shop_owner_lead_and_assist(self):
		booking = self._shop_booking()

		self._login_as(self.client_account)
		response = self.http_client.post(
			'/api/bookings/payments/pay-with-credits/',
			data=json.dumps({'booking_id': booking.id, 'amount': 1000}),
			content_type='application/json',
		)

		self.assertEqual(response.status_code, 200)
		booking.refresh_from_db()
		self.assertEqual(booking.status, Booking.Status.COMPLETED)
		self.assertEqual(booking.payment_status, Booking.PaymentStatus.FULLY_PAID)
		self.assertEqual(Wallet.objects.get(account=self.client_account).balance, Decimal('4000.00'))
		self.assertEqual(Wallet.objects.get(account=self.shop_owner_account).balance, Decimal('100.00'))
		self.assertEqual(Wallet.objects.get(account=self.lead_account).balance, Decimal('450.00'))
		self.assertEqual(Wallet.objects.get(account=self.assist_account).balance, Decimal('450.00'))
		self.assertEqual(booking.receipt.platform_fee, Decimal('100.00'))
		self.assertEqual(booking.receipt.mechanic_payout, Decimal('900.00'))

	def test_backjob_credits_payment_only_splits_new_backjob_charges(self):
		booking = self._shop_booking(amount=Decimal('1000.00'))
		backjob = Backjob.objects.create(
			booking=booking,
			status=Booking.Status.PENDING_PAYMENT,
			requested_by=self.client_account,
			reason='Issue came back',
		)
		quotation = Quotation.objects.create(
			booking=booking,
			mechanic=self.lead_account,
			status=Quotation.Status.ACCEPTED,
			is_backjob=True,
			total_amount=Decimal('1300.00'),
			is_final=True,
		)
		QuotationItem.objects.create(
			quotation=quotation,
			line_kind=QuotationItem.LineKind.SERVICE,
			service=self.service,
			description='Original paid service',
			quantity=1,
			unit_price=Decimal('1000.00'),
			status=Quotation.Status.ACCEPTED,
			is_backjob_line=False,
		)
		QuotationItem.objects.create(
			quotation=quotation,
			line_kind=QuotationItem.LineKind.ITEM,
			description='Replacement part',
			quantity=1,
			unit_price=Decimal('300.00'),
			status=Quotation.Status.ACCEPTED,
			is_backjob_line=True,
			backjob=backjob,
		)

		self._login_as(self.client_account)
		response = self.http_client.post(
			'/api/bookings/payments/pay-with-credits/',
			data=json.dumps({'booking_id': booking.id, 'amount': 300}),
			content_type='application/json',
		)

		self.assertEqual(response.status_code, 200)
		booking.refresh_from_db()
		backjob.refresh_from_db()
		self.assertEqual(booking.amount_fee, Decimal('300.00'))
		self.assertEqual(booking.status, Booking.Status.COMPLETED)
		self.assertEqual(backjob.status, Booking.Status.COMPLETED)
		self.assertEqual(Wallet.objects.get(account=self.client_account).balance, Decimal('4700.00'))
		self.assertEqual(Wallet.objects.get(account=self.shop_owner_account).balance, Decimal('30.00'))
		self.assertEqual(Wallet.objects.get(account=self.lead_account).balance, Decimal('135.00'))
		self.assertEqual(Wallet.objects.get(account=self.assist_account).balance, Decimal('135.00'))
		self.assertEqual(booking.receipt.platform_fee, Decimal('30.00'))
		self.assertEqual(booking.receipt.mechanic_payout, Decimal('270.00'))

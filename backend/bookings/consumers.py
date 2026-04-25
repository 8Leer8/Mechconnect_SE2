import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async


logger = logging.getLogger(__name__)


class BookingConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        session = self.scope['session']
        account_id = await sync_to_async(session.get)('account_id')
        
        if not account_id:
            await self.close(code=4001)
            return

        self.group_name = f"user_{account_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)

        # Also subscribe mechanics to the global broadcasts group so they receive
        # broadcast lifecycle events (accepted/removed) and can update maps/lists
        try:
            from users.models import Account as AccountModel

            is_mechanic = await sync_to_async(lambda: AccountModel.objects.filter(id=account_id, mechanic__isnull=False).exists())()
            if is_mechanic:
                await self.channel_layer.group_add('broadcasts', self.channel_name)
        except Exception:
            # Non-critical; continue accepting socket even if DB check fails
            pass

        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        try:
            # Remove from broadcasts group if present
            await self.channel_layer.group_discard('broadcasts', self.channel_name)
        except Exception:
            pass
    async def booking_update(self, event):
        await self.send(text_data=json.dumps(event))

    async def notification_update(self, event):
        await self.send(text_data=json.dumps(event))

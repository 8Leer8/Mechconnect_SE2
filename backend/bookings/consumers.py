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
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def booking_update(self, event):
        await self.send(text_data=json.dumps(event))

from rest_framework import serializers
from .models import PricingConfiguration


class PricingConfigurationSerializer(serializers.ModelSerializer):
    def validate_token_packages(self, value):
        if value in (None, ""):
            return []

        if not isinstance(value, list):
            raise serializers.ValidationError("token_packages must be a list")

        normalized = []
        seen_tokens = set()

        for idx, package in enumerate(value):
            if not isinstance(package, dict):
                raise serializers.ValidationError(
                    f"token_packages[{idx}] must be an object with tokens and price"
                )

            if 'tokens' not in package or 'price' not in package:
                raise serializers.ValidationError(
                    f"token_packages[{idx}] must include tokens and price"
                )

            try:
                tokens = int(package['tokens'])
                price = round(float(package['price']), 2)
            except (TypeError, ValueError):
                raise serializers.ValidationError(
                    f"token_packages[{idx}] has invalid tokens or price"
                )

            if tokens <= 0:
                raise serializers.ValidationError(
                    f"token_packages[{idx}] tokens must be greater than 0"
                )

            if price < 0:
                raise serializers.ValidationError(
                    f"token_packages[{idx}] price must be 0 or greater"
                )

            if tokens in seen_tokens:
                raise serializers.ValidationError(
                    f"token_packages has duplicate tokens value: {tokens}"
                )

            normalized.append({'tokens': tokens, 'price': price})
            seen_tokens.add(tokens)

        normalized.sort(key=lambda item: item['tokens'])
        return normalized

    class Meta:
        model = PricingConfiguration
        fields = '__all__'
        read_only_fields = ['id', 'updated_at']

import requests
from django.conf import settings

HF_API_URL = "https://viventa-mechconnect-api.hf.space/predict"

def predict_specialties(text):
    """Call HF Space API instead of local model"""
    try:
        # Call your HF Space
        response = requests.post(
            HF_API_URL,
            data={'problem': text},
            timeout=10
        )
        response.raise_for_status()
        
        hf_results = response.json()  # Returns: [{"label": "...", "score": ...}, ...]
        
        # Transform to match existing format with 50% confidence threshold
        results = [
            {
                'specialty': item['label'],
                'confidence': round(item['score'])
            }
            for item in hf_results
            if item['score'] >= 30  # Only include 50%+ confidence
        ]
        
        return sorted(results, key=lambda x: x['confidence'], reverse=True)
        
    except requests.exceptions.RequestException as e:
        print(f"HF API error: {e}")
        return []  # Return empty if API fails
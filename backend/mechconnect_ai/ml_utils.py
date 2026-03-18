import os
import pickle
import numpy as np
from tensorflow import keras
from tensorflow.keras.preprocessing.sequence import pad_sequences
from django.conf import settings

ML_DIR = os.path.join(settings.BASE_DIR, 'mechconnect_ai', 'ml')

# Load once at startup — not on every request
model = keras.models.load_model(os.path.join(ML_DIR, 'mechconnect_ai.keras'))
specialties = np.load(os.path.join(ML_DIR, 'specialty_columns.npy'), allow_pickle=True)

with open(os.path.join(ML_DIR, 'tokenizer.pickle'), 'rb') as f:
    tokenizer = pickle.load(f)


def predict_specialties(text):
    seq = tokenizer.texts_to_sequences([text])
    pad = pad_sequences(seq, maxlen=11, padding='post')
    pred = model.predict(pad, verbose=0)[0]

    results = []
    for i, conf in enumerate(pred):
        if conf > 0.3:  # only include specialties with 30%+ confidence
            results.append({
                'specialty': specialties[i],
                'confidence': round(float(conf) * 100)
            })

    return sorted(results, key=lambda x: x['confidence'], reverse=True)
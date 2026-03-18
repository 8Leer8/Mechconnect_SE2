# MechConnect AI Documentation

## What is MechConnect AI?

MechConnect AI reads car problem descriptions and recommends which repair specialties are needed. Input a problem description, get instant recommendations with confidence scores for each specialty.

## One Example

**Input:** "Engine makes a knocking sound when I accelerate"

**Output:**

- Engine Repair: 92%
- Fuel System: 65%
- Computer Diagnostics: 48%

The AI understands the problem and recommends which specialties to involve.

## The Three Required Files

### 1. mechconnect_ai.keras

The trained neural network brain containing all learned patterns from 6,053 car problems. This file generates all predictions. Size: ~20 MB.

**What it stores:** Millions of learned weights that let the AI recognize patterns in problem descriptions and map them to repair specialties.

### 2. tokenizer.pickle

Converts English words to numbers. The AI only understands numbers, not words.

**How it works:** "engine" becomes 12, "knocking" becomes 45. This ensures consistent word-to-number conversion. It learned the top 5,000 words from the training data.

### 3. specialty_columns.npy

A list of all 20 repair specialties. Maps the AI's output numbers back to readable names like "Engine Repair", "Brakes", "Transmission", etc.

**The 20 specialties:** Engine Repair, Oil Change, Transmission, Brakes, Tires, Wheel Alignment, Cooling System, Electrical System, Computer Diagnostics, Fuel System, Exhaust, Suspension, Drivetrain, Battery Service, Ignition System, Pre-Purchase Inspection, Vehicle Lighting, Timing Belt, Alternator Repair, General Maintenance

## How to Use It

### Installation

```
pip install tensorflow numpy
```

### Basic Code

```python
import pickle
import numpy as np
from tensorflow import keras
from tensorflow.keras.preprocessing.sequence import pad_sequences

# Load all components
model = keras.models.load_model('mechconnect_ai.keras')
with open('tokenizer.pickle', 'rb') as f:
    tokenizer = pickle.load(f)
specialties = np.load('specialty_columns.npy', allow_pickle=True)

# Make prediction
def predict(text):
    seq = tokenizer.texts_to_sequences([text])
    pad = pad_sequences(seq, maxlen=11, padding='post')
    pred = model.predict(pad, verbose=0)[0]

    results = []
    for i, conf in enumerate(pred):
        if conf > 0.3:  # Threshold of 30%
            results.append((specialties[i], conf))

    return sorted(results, key=lambda x: x[1], reverse=True)

# Test
results = predict("Engine makes knocking sound when I accelerate")
for specialty, confidence in results:
    print(f"{specialty}: {int(confidence*100)}%")
```

## File Explanations

**mechconnect_ai.keras:** When loaded, it becomes your prediction engine. It contains weights learned from analyzing thousands of car problems. These weights enable it to recognize patterns in new problem text.

**tokenizer.pickle:** Created during training on 6,053 problems. It learned which 5,000 words appear most frequently. Any new problem text gets converted using these same word-to-number rules, ensuring consistency.

**specialty_columns.npy:** Simply a reference list. When the model outputs 20 values, this file tells you which value is which specialty. Position 0 = "Engine Repair", position 1 = "Oil Change", etc.

## Key Facts

- Requires all three files together
- Input: Plain English text description
- Output: Confidence scores 0.0-1.0 for 20 specialties
- Speed: Less than 1 second per prediction
- Accuracy: 85-90% on typical problems
- Works best with 5-15 word descriptions that are specific

## Troubleshooting

**"File not found?"** - All three files must be in your working directory. Check file names match exactly.

**"Module not found?"** - Run: `pip install tensorflow numpy`

**"Bad predictions?"** - Your description might be too vague. Use specific terms: "Brakes feel spongy" works better than "Something's wrong with the brakes"

**Very slow?** - You're using CPU. Acceptable for occasional use (< 2 seconds). For bulk predictions, use GPU if available.

## Best Practices

- Load the model once at startup, reuse it for many predictions
- Use 0.3 confidence threshold for most cases
- Never treat AI predictions as final - they're investigation guides
- Always verify with qualified mechanic expertise
- Use specific problem descriptions for best results
- For complex multi-issue problems, split into separate predictions

## Integration Paths

Can be used standalone, in web APIs (Flask/FastAPI), connected to databases, or in batch processing scripts. Choose based on your needs.

---

Created March 15, 2026 | MechConnect AI
Julhadz S. Jinno
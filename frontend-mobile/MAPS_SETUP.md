# Google Maps Setup Guide

This guide will help you set up Google Maps for the location selection feature in the broadcast request flow.

## Prerequisites

The following packages have been installed:
- `react-native-maps` (v1.20.1)
- `expo-location` (v19.0.8)

## Google Maps API Key Setup

To use Google Maps in your app, you need to obtain a Google Maps API key:

### 1. Get a Google Maps API Key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Maps SDK for Android
   - Maps SDK for iOS (if building for iOS)
   - Geocoding API (for address lookup)
4. Go to "Credentials" and create an API key
5. (Optional but recommended) Restrict your API key:
   - For Android: Restrict by Android apps and add your package name
   - For iOS: Restrict by iOS apps and add your bundle identifier

### 2. Add API Key to app.json

Open `app.json` and replace `YOUR_GOOGLE_MAPS_API_KEY_HERE` with your actual API key in two places:

```json
"android": {
  "config": {
    "googleMaps": {
      "apiKey": "YOUR_ACTUAL_API_KEY_HERE"
    }
  }
},
"ios": {
  "config": {
    "googleMapsApiKey": "YOUR_ACTUAL_API_KEY_HERE"
  }
}
```

### 3. Rebuild Your App

After adding the API key, you need to rebuild your app:

```bash
# For development build
npx expo prebuild --clean

# Then run
npx expo run:android
# or
npx expo run:ios
```

**Note:** Changes to `app.json` require a rebuild. `expo start` alone won't pick up the changes.

## Features Implemented

### 1. Location Selection Button
In the broadcast request screen, the manual location input fields have been replaced with a single button that says "Tap to select location from map".

### 2. Map Screen
- **Full-screen map** showing the user's current location
- **Tap to pin** - Users can tap anywhere on the map to select a location
- **Address display** - Selected location's address is shown at the top
- **Current location** - Blue dot shows the user's current location
- **Confirm button** - At the bottom to confirm the selected location
- **Cancel button** - To go back without selecting

### 3. Location Data Flow
1. User taps "Select Location" button in broadcast request
2. App navigates to the map screen
3. Map loads with user's current location (or Manila as default)
4. User taps on map to select a location
5. Address is automatically geocoded from coordinates
6. User taps "Confirm Location"
7. Location data is passed back to broadcast request
8. Selected address is displayed in the location section

### 4. Optional Landmark
After selecting a location from the map, users can optionally add a landmark for more specific directions.

## Testing Without API Key

If you don't have a Google Maps API key yet, the app will still work but:
- The map might show a "For development purposes only" watermark
- Some features might be limited
- You should add the API key before releasing to production

## Permissions

The app.json has been configured with location permissions:
- Location permission message has been added
- The app will request location permission when the map screen is opened

## Troubleshooting

### Map not showing
- Verify your API key is correct
- Check if the Maps SDK APIs are enabled in Google Cloud Console
- Rebuild the app after adding the API key

### Location permission denied
- Go to device settings and enable location permissions for the app
- Restart the app

### Address not showing
- Verify the Geocoding API is enabled in Google Cloud Console
- Check your API key restrictions

## Production Considerations

Before deploying to production:
1. **Secure your API key** - Use restrictions in Google Cloud Console
2. **Enable billing** - Google Maps requires billing to be enabled
3. **Monitor usage** - Set up billing alerts to avoid unexpected charges
4. **Test thoroughly** - Test on both Android and iOS devices

## Support

For more information:
- [React Native Maps Documentation](https://github.com/react-native-maps/react-native-maps)
- [Expo Location Documentation](https://docs.expo.dev/versions/latest/sdk/location/)
- [Google Maps Platform](https://developers.google.com/maps)

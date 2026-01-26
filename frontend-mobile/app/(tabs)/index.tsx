import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, Alert } from 'react-native';

export default function App() {
  const handlePress = () => {
    Alert.alert("Success!", "Your React Native environment is fully operational.");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MechConnect Mobile</Text>
      <Text style={styles.subtitle}>
        Running on {Platform.OS === 'android' ? 'Android' : 'iOS'}
      </Text>
      
      <View style={styles.card}>
        <Text style={styles.cardText}>
          If you are reading this on your phone screen, the connection is successful.
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <Button title="Test Interaction" onPress={handlePress} color="#007AFF" />
      </View>

      <StatusBar style="auto" />
    </View>
  );
}

// Just a little helper to detect OS for the text above
import { Platform } from 'react-native'; 

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 30,
  },
  card: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3, // This adds shadow on Android
    marginBottom: 20,
  },
  cardText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  buttonContainer: {
    marginTop: 10,
    width: '100%',
    maxWidth: 200,
  }
});
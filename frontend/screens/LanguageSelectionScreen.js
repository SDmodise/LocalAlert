import React, { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

const languages = [
  { code: 'en', name: 'English' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'zu', name: 'isiZulu' },
  { code: 'xh', name: 'isiXhosa' },
  { code: 'nso', name: 'Sepedi' },
  { code: 'tn', name: 'Setswana' },
  { code: 'st', name: 'Sesotho' },
  { code: 'ts', name: 'XiTsonga' },
  { code: 'ss', name: 'siSwati' },
  { code: 've', name: 'Tshivenda' },
  { code: 'nr', name: 'isiNdebele' },
];

export default function LanguageSelectionScreen() {
  const [selectedLanguage, setSelectedLanguage] = useState(null);

  const handleContinue = async () => {
  if (!selectedLanguage) {
    return;
  }

  try {
    await AsyncStorage.setItem('selectedLanguage', selectedLanguage);

    console.log('Language saved:', selectedLanguage);
  } catch (error) {
    console.error('Error saving language:', error);
  }
};

  return (
    <View style={styles.container}>

      <View style={styles.header}>
        <Text style={styles.logo}>LocalAlert</Text>

        <Text style={styles.title}>
          Choose your language
        </Text>
      </View>

      <ScrollView
        style={styles.languageList}
        contentContainerStyle={styles.languageListContent}
        showsVerticalScrollIndicator={false}
      >
        {languages.map((language) => {
          const isSelected = selectedLanguage === language.code;

          return (
            <TouchableOpacity
              key={language.code}
              style={[
                styles.languageButton,
                isSelected && styles.selectedLanguage,
              ]}
              onPress={() => setSelectedLanguage(language.code)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.languageText,
                  isSelected && styles.selectedLanguageText,
                ]}
              >
                {language.name}
              </Text>

              {isSelected && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        style={[
          styles.continueButton,
          !selectedLanguage && styles.disabledButton,
        ]}
        onPress={handleContinue}
        disabled={!selectedLanguage}
        activeOpacity={0.8}
      >
        <Text style={styles.continueText}>
          Continue
        </Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 30,
  },

  header: {
    alignItems: 'center',
    marginBottom: 25,
  },

  logo: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 25,
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },

  subtitle: {
    fontSize: 16,
    marginTop: 8,
    color: '#666666',
  },

  languageList: {
    flex: 1,
  },

  languageListContent: {
    paddingVertical: 5,
  },

  languageButton: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },

  selectedLanguage: {
    borderColor: '#222222',
    backgroundColor: '#F2F2F2',
  },

  languageText: {
    fontSize: 17,
    fontWeight: '500',
  },

  selectedLanguageText: {
    fontWeight: '700',
  },

  checkmark: {
    fontSize: 22,
    fontWeight: '700',
  },

  continueButton: {
    height: 55,
    borderRadius: 12,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
  },

  disabledButton: {
    backgroundColor: '#BBBBBB',
  },

  continueText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
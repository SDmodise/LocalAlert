import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';

export default function HomeScreen({ user, onLogout }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>LocalAlert</Text>
            <Text style={styles.headerSubtitle}>
              Community safety network
            </Text>
          </View>

          <TouchableOpacity
            style={styles.settingsButton}
            activeOpacity={0.8}
            onPress={onLogout}
            accessibilityLabel="Log out"
          >
            <Text style={styles.settingsIcon}>⚙</Text>
          </TouchableOpacity>
        </View>

        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>
            Welcome to LocalAlert
          </Text>

          <Text style={styles.welcomeText}>
            Help your community respond quickly when someone goes missing.
          </Text>
        </View>

        {/* Report Missing Person */}
        <TouchableOpacity
          style={styles.reportButton}
          activeOpacity={0.85}
        >
          <Text style={styles.reportIcon}>🚨</Text>

          <View style={styles.reportTextContainer}>
            <Text style={styles.reportTitle}>
              REPORT MISSING PERSON
            </Text>

            <Text style={styles.reportSubtitle}>
              Send an alert to your family, police and nearby community
            </Text>
          </View>
        </TouchableOpacity>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>
          Quick Actions
        </Text>

        <View style={styles.actionRow}>

          {/* Family Link */}
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.8}
          >
            <Text style={styles.actionIcon}>👨‍👩‍👧</Text>

            <Text style={styles.actionTitle}>
              Family Link
            </Text>

            <Text style={styles.actionDescription}>
              Manage your family
            </Text>
          </TouchableOpacity>

          {/* Spotted Person */}
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.8}
          >
            <Text style={styles.actionIcon}>📍</Text>

            <Text style={styles.actionTitle}>
              Spotted Person
            </Text>

            <Text style={styles.actionDescription}>
              Report a sighting
            </Text>
          </TouchableOpacity>

        </View>

        {/* Still Missing */}
        <TouchableOpacity
          style={styles.stillMissingCard}
          activeOpacity={0.8}
        >
          <View>
            <Text style={styles.stillMissingTitle}>
              Still Missing
            </Text>

            <Text style={styles.stillMissingText}>
              View active missing-person alerts
            </Text>
          </View>

          <Text style={styles.arrow}>
            →
          </Text>
        </TouchableOpacity>

        {/* Information */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            How LocalAlert works
          </Text>

          <Text style={styles.infoText}>
            Report a missing person and LocalAlert will notify the
            appropriate family members, police and nearby community.
          </Text>
        </View>

      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNavigation}>

        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navIcon}>⌂</Text>
          <Text style={styles.activeNavText}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navIcon}>🔔</Text>
          <Text style={styles.navText}>Alerts</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navIcon}>👨‍👩‍👧</Text>
          <Text style={styles.navText}>Family</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navIcon}>⚙</Text>
          <Text style={styles.navText}>Settings</Text>
        </TouchableOpacity>

      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },

  container: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 25,
  },

  /* Header */

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  logo: {
    fontSize: 28,
    fontWeight: '800',
  },

  headerSubtitle: {
    fontSize: 13,
    color: '#777777',
    marginTop: 3,
  },

  settingsButton: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },

  settingsIcon: {
    fontSize: 22,
  },

  /* Welcome */

  welcomeSection: {
    marginTop: 30,
    marginBottom: 20,
  },

  welcomeTitle: {
    fontSize: 25,
    fontWeight: '700',
  },

  welcomeText: {
    fontSize: 15,
    color: '#666666',
    lineHeight: 22,
    marginTop: 8,
  },

  /* Report Button */

  reportButton: {
    backgroundColor: '#222222',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },

  reportIcon: {
    fontSize: 32,
    marginRight: 15,
  },

  reportTextContainer: {
    flex: 1,
  },

  reportTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },

  reportSubtitle: {
    color: '#DDDDDD',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
  },

  /* Quick Actions */

  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    marginTop: 28,
    marginBottom: 12,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },

  actionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },

  actionIcon: {
    fontSize: 27,
    marginBottom: 12,
  },

  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },

  actionDescription: {
    fontSize: 12,
    color: '#777777',
    marginTop: 5,
    lineHeight: 17,
  },

  /* Still Missing */

  stillMissingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    marginTop: 15,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },

  stillMissingTitle: {
    fontSize: 16,
    fontWeight: '700',
  },

  stillMissingText: {
    fontSize: 13,
    color: '#777777',
    marginTop: 5,
  },

  arrow: {
    fontSize: 25,
  },

  /* Information */

  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 18,
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },

  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
  },

  infoText: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 20,
    marginTop: 7,
  },

  /* Bottom Navigation */

  bottomNavigation: {
    height: 70,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },

  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 65,
  },

  navIcon: {
    fontSize: 19,
    marginBottom: 4,
  },

  navText: {
    fontSize: 11,
    color: '#777777',
  },

  activeNavText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
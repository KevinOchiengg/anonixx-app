import React from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
} from 'react-native'

import { Check, Crown } from 'lucide-react-native'
import StarryBackground from '../../components/common/StarryBackground';

const features = [
  'Unlimited swipes',
  'See who liked you',
  'Boost your profile',
  'Premium reactions',
  'No ads',
  'Advanced filters',
]

const plans = [
  { id: 'monthly', name: '1 Month', price: '$9.99', perMonth: '$9.99/mo' },
  {
    id: 'quarterly',
    name: '3 Months',
    price: '$24.99',
    perMonth: '$8.33/mo',
    save: '17%',
  },
  {
    id: 'yearly',
    name: '1 Year',
    price: '$79.99',
    perMonth: '$6.67/mo',
    save: '33%',
  },
]

export default function PremiumScreen({ navigation }) {
  const [selectedPlan, setSelectedPlan] = React.useState('quarterly')

  return (
    <SafeAreaView style={styles.container}>
      <StarryBackground />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Echo Premium</Text>
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.heroSection}>
          <View style={styles.crownContainer}>
            <Crown size={64} color='#fbbf24' />
          </View>
          <Text style={styles.heroTitle}>Unlock Premium Features</Text>
          <Text style={styles.heroSubtitle}>Get the most out of Echo</Text>
        </View>

        <View style={styles.featuresContainer}>
          {features.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <View style={styles.checkIcon}>
                <Check size={20} color='#10b981' />
              </View>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.plansTitle}>Choose Your Plan</Text>
        {plans.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            onPress={() => setSelectedPlan(plan.id)}
            style={[
              styles.planCard,
              selectedPlan === plan.id && styles.planCardSelected,
            ]}
          >
            {plan.save && (
              <View style={styles.saveBadge}>
                <Text style={styles.saveText}>SAVE {plan.save}</Text>
              </View>
            )}
            <View style={styles.planInfo}>
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.planPrice}>{plan.price}</Text>
              <Text style={styles.planPerMonth}>{plan.perMonth}</Text>
            </View>
            {selectedPlan === plan.id && (
              <View style={styles.selectedIndicator}>
                <Check size={20} color='#ffffff' />
              </View>
            )}
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.subscribeButton}>
          <Text style={styles.subscribeButtonText}>Subscribe Now</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Cancel anytime. Subscription will auto-renew.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
  scrollView: { flex: 1 },
  heroSection: { alignItems: 'center', paddingVertical: 40 },
  crownContainer: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    padding: 20,
    borderRadius: 50,
    marginBottom: 20,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  heroSubtitle: { fontSize: 16, color: '#9ca3af' },
  featuresContainer: { paddingHorizontal: 16, marginBottom: 32 },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkIcon: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    padding: 8,
    borderRadius: 20,
    marginRight: 12,
  },
  featureText: { color: '#ffffff', fontSize: 16 },
  plansTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  planCard: {
    backgroundColor: '#16213e',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#374151',
    position: 'relative',
  },
  planCardSelected: { borderColor: '#a855f7' },
  saveBadge: {
    position: 'absolute',
    top: -12,
    right: 20,
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  saveText: { color: '#ffffff', fontSize: 10, fontWeight: 'bold' },
  planInfo: { flex: 1 },
  planName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#a855f7',
    marginBottom: 2,
  },
  planPerMonth: { fontSize: 14, color: '#9ca3af' },
  selectedIndicator: {
    backgroundColor: '#a855f7',
    borderRadius: 20,
    padding: 8,
  },
  subscribeButton: {
    backgroundColor: '#a855f7',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 18,
    borderRadius: 16,
    elevation: 4,
    shadowColor: '#a855f7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  subscribeButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  disclaimer: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 32,
    marginTop: 16,
    marginBottom: 32,
  },
})

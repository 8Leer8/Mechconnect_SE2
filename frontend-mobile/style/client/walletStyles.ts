import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1419',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#17171A',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2E',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 140, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 140, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingTop: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#8E8E93',
  },
  // Balance Card - Horizontal Layout
  balanceCard: {
    backgroundColor: '#17171A',
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2E',
    marginBottom: 24,
    gap: 16,
  },
  balanceIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 140, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  balanceLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 0.3,
  },
  balanceValueContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  balanceValue: {
    fontSize: 40,
    fontWeight: '900',
    color: '#FF8C00',
    includeFontPadding: false,
    lineHeight: 48,
    minWidth: 60,
  },
  balanceValueLarge: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FF8C00',
    includeFontPadding: false,
    lineHeight: 40,
    minWidth: 60,
  },
  balanceSub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6D6D70',
  },
  sharedWalletNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 140, 0, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 0, 0.15)',
  },
  sharedWalletNoteText: {
    fontSize: 11,
    color: '#B0B0B5',
    fontWeight: '500',
    lineHeight: 15,
  },
  // Section
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 16,
  },
  // Packages Grid
  packagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  packageCard: {
    width: '30%',
    minWidth: 100,
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2E',
  },
  packageIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 140, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  packageAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  packageLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  packagePrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF8C00',
    marginTop: 6,
  },
  // Transactions
  txListContainer: {
    maxHeight: 400,
    backgroundColor: '#17171A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2E',
    overflow: 'hidden',
  },
  txList: {
    backgroundColor: '#17171A',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2E',
  },
  txIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txInfo: {
    flex: 1,
  },
  txType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  txTime: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#34C759',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusCompleted: {
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
  },
  statusCompletedText: {
    color: '#34C759',
  },
  statusPending: {
    backgroundColor: 'rgba(255, 140, 0, 0.15)',
  },
  statusPendingText: {
    color: '#FF8C00',
  },
  statusFailed: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
  },
  statusFailedText: {
    color: '#FF3B30',
  },
  // Empty State
  emptyCard: {
    backgroundColor: '#17171A',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2E',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
});

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';

// ─── Shared card wrapper ──────────────────────────────────────────────
const Card = ({ children, style }: { children: React.ReactNode; style?: object }) => (
  <View style={[s.card, style]}>{children}</View>
);

const Row = ({ children, style }: { children: React.ReactNode; style?: object }) => (
  <View style={[s.row, style]}>{children}</View>
);

// ─── Card-level skeletons ─────────────────────────────────────────────

/** Booking card skeleton — used in client/mechanic booking lists, shopowner jobs */
export function SkeletonBookingCard() {
  return (
    <Card>
      {/* Top row: icon circle + status/title + time */}
      <Row>
        <Skeleton circle width={40} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Row style={{ gap: 8 }}>
            <Skeleton width={70} height={20} borderRadius={10} />
            <Skeleton width={40} height={12} />
          </Row>
          <Skeleton width={120} height={12} style={{ marginTop: 6 }} />
        </View>
        <Skeleton width={45} height={12} />
      </Row>
      {/* Info rows */}
      <View style={{ marginTop: 12, paddingLeft: 50, gap: 8 }}>
        <Row>
          <Skeleton width={14} height={14} borderRadius={3} />
          <Skeleton width="70%" height={12} style={{ marginLeft: 8 }} />
        </Row>
        <Row>
          <Skeleton width={14} height={14} borderRadius={3} />
          <Skeleton width="50%" height={12} style={{ marginLeft: 8 }} />
        </Row>
        <Row>
          <Skeleton width={14} height={14} borderRadius={3} />
          <Skeleton width="40%" height={12} style={{ marginLeft: 8 }} />
        </Row>
      </View>
      {/* Footer */}
      <View style={s.cardFooter}>
        <Skeleton width={80} height={16} />
        <Skeleton width={75} height={30} borderRadius={15} />
      </View>
    </Card>
  );
}

/** Job card skeleton — mechanic home active jobs (horizontal layout) */
export function SkeletonJobCard() {
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Skeleton circle width={40} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Row style={{ gap: 6 }}>
          <Skeleton width={130} height={14} />
          <Skeleton circle width={8} />
        </Row>
        <Row style={{ marginTop: 6 }}>
          <Skeleton width={14} height={14} borderRadius={3} />
          <Skeleton width="60%" height={11} style={{ marginLeft: 6 }} />
        </Row>
        <Row style={{ marginTop: 4 }}>
          <Skeleton width={14} height={14} borderRadius={3} />
          <Skeleton width="40%" height={11} style={{ marginLeft: 6 }} />
        </Row>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Skeleton width={60} height={14} />
        <Skeleton width={12} height={12} borderRadius={3} />
      </View>
    </Card>
  );
}

/** Request card skeleton — mechanic home pending requests, client requests */
export function SkeletonRequestCard() {
  return (
    <Card>
      {/* Type badge + date */}
      <Row style={{ justifyContent: 'space-between' }}>
        <Skeleton width={120} height={24} borderRadius={12} />
        <Skeleton width={60} height={12} />
      </Row>
      {/* Info rows */}
      <View style={{ marginTop: 12, gap: 8 }}>
        <Row>
          <Skeleton width={14} height={14} borderRadius={3} />
          <Skeleton width="55%" height={12} style={{ marginLeft: 8 }} />
        </Row>
        <Row>
          <Skeleton width={14} height={14} borderRadius={3} />
          <Skeleton width="65%" height={12} style={{ marginLeft: 8 }} />
        </Row>
      </View>
      {/* Action buttons */}
      <Row style={{ marginTop: 14, justifyContent: 'flex-end', gap: 10 }}>
        <Skeleton width={80} height={34} borderRadius={17} />
      </Row>
    </Card>
  );
}

/** Emergency card skeleton */
export function SkeletonEmergencyCard() {
  return (
    <Card style={{ borderColor: '#FF3B3030' }}>
      {/* Header */}
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ gap: 8 }}>
          <Skeleton circle width={28} />
          <Skeleton width={90} height={22} borderRadius={11} />
        </Row>
        <Skeleton width={50} height={12} />
      </Row>
      <Skeleton width={130} height={14} style={{ marginTop: 10 }} />
      {/* Info rows */}
      <View style={{ marginTop: 12, gap: 8 }}>
        <Row>
          <Skeleton width={14} height={14} borderRadius={3} />
          <Skeleton width="50%" height={12} style={{ marginLeft: 8 }} />
        </Row>
        <Row>
          <Skeleton width={14} height={14} borderRadius={3} />
          <Skeleton width="35%" height={12} style={{ marginLeft: 8 }} />
        </Row>
        <Row>
          <Skeleton width={14} height={14} borderRadius={3} />
          <Skeleton width="70%" height={12} style={{ marginLeft: 8 }} />
        </Row>
      </View>
      {/* Image placeholder */}
      <Skeleton width="100%" height={120} borderRadius={12} style={{ marginTop: 12 }} />
      {/* Action buttons */}
      <Row style={{ marginTop: 14, gap: 10, justifyContent: 'space-between' }}>
        <Skeleton width="30%" height={38} borderRadius={19} />
        <Skeleton width="30%" height={38} borderRadius={19} />
        <Skeleton width="30%" height={38} borderRadius={19} />
      </Row>
    </Card>
  );
}

/** Discover mechanic card skeleton */
export function SkeletonDiscoverMechanicCard() {
  return (
    <Card>
      <Row>
        <Skeleton width={48} height={48} borderRadius={16} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Skeleton width={120} height={14} />
          <Row style={{ marginTop: 6, gap: 4 }}>
            <Skeleton width={14} height={14} borderRadius={3} />
            <Skeleton width={30} height={12} />
          </Row>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Skeleton circle width={10} />
          <Skeleton width={50} height={10} />
        </View>
      </Row>
      <View style={s.cardDivider}>
        <Row>
          <Skeleton width={14} height={14} borderRadius={3} />
          <Skeleton width={100} height={12} style={{ marginLeft: 8 }} />
        </Row>
      </View>
    </Card>
  );
}

/** Discover shop card skeleton */
export function SkeletonDiscoverShopCard() {
  return (
    <Card>
      <Skeleton width="100%" height={120} borderRadius={12} />
      <Skeleton width={140} height={16} style={{ marginTop: 12 }} />
      <Skeleton width={100} height={12} style={{ marginTop: 6 }} />
      <Skeleton width="90%" height={12} style={{ marginTop: 8 }} />
      <View style={s.cardDivider}>
        <Row>
          <Skeleton width={14} height={14} borderRadius={3} />
          <Skeleton width={100} height={12} style={{ marginLeft: 8 }} />
        </Row>
      </View>
    </Card>
  );
}

/** Discover service card skeleton */
export function SkeletonDiscoverServiceCard() {
  return (
    <Card>
      <Skeleton width="100%" height={140} borderRadius={12} />
      <Row style={{ marginTop: 12, justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Skeleton width={130} height={16} />
          <Skeleton width={80} height={20} borderRadius={10} style={{ marginTop: 6 }} />
        </View>
        <Skeleton width={70} height={16} />
      </Row>
      <Skeleton width="95%" height={12} style={{ marginTop: 10 }} />
      <Skeleton width="70%" height={12} style={{ marginTop: 4 }} />
    </Card>
  );
}

/** Stat card skeleton — for stat grids */
export function SkeletonStatCard() {
  return (
    <View style={s.statCard}>
      <Skeleton circle width={40} />
      <Skeleton width={50} height={20} style={{ marginTop: 10 }} />
      <Skeleton width={70} height={11} style={{ marginTop: 6 }} />
    </View>
  );
}

/** Mechanic card skeleton — shopowner mechanics list */
export function SkeletonMechanicCard() {
  return (
    <Card>
      <Row>
        <Skeleton circle width={56} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Skeleton width={120} height={14} />
          <Skeleton width={150} height={12} style={{ marginTop: 6 }} />
          <Skeleton width={100} height={12} style={{ marginTop: 4 }} />
        </View>
      </Row>
      <View style={{ marginTop: 10 }}>
        <Skeleton width="90%" height={11} />
        <Skeleton width="60%" height={11} style={{ marginTop: 4 }} />
      </View>
      <Row style={{ marginTop: 10, gap: 16 }}>
        <Skeleton width={60} height={12} />
        <Skeleton width={80} height={12} />
      </Row>
    </Card>
  );
}

/** Map job/broadcast card skeleton */
export function SkeletonMapCard() {
  return (
    <Card>
      <Row style={{ gap: 8 }}>
        <Skeleton circle width={10} />
        <Skeleton width={140} height={14} />
        <Skeleton width={40} height={18} borderRadius={9} />
      </Row>
      <Skeleton width="90%" height={12} style={{ marginTop: 10 }} />
      <Skeleton width="60%" height={12} style={{ marginTop: 4 }} />
      <Row style={{ marginTop: 10, gap: 6 }}>
        <Skeleton width={70} height={24} borderRadius={12} />
        <Skeleton width={70} height={24} borderRadius={12} />
      </Row>
      <Row style={{ marginTop: 10, justifyContent: 'space-between' }}>
        <Row style={{ gap: 4 }}>
          <Skeleton width={14} height={14} borderRadius={3} />
          <Skeleton width={60} height={12} />
        </Row>
        <Skeleton width={100} height={32} borderRadius={16} />
      </Row>
    </Card>
  );
}

// ─── Screen-level skeletons ───────────────────────────────────────────

/** Mechanic home screen skeleton body (below header, inside ScrollView) */
export function SkeletonMechanicHome() {
  return (
    <SkeletonGroup>
      <View style={s.screen}>
        {/* Earnings Banner */}
        <Card style={{ flexDirection: 'row', alignItems: 'center', padding: 18 }}>
          <View style={{ flex: 1 }}>
            <Skeleton width={100} height={12} />
            <Skeleton width={130} height={24} style={{ marginTop: 6 }} />
          </View>
          <Skeleton circle width={44} />
        </Card>

        {/* Active Jobs */}
        <View style={{ marginBottom: 20 }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <Row style={{ gap: 8 }}>
              <Skeleton circle width={8} />
              <Skeleton width={90} height={16} />
            </Row>
            <Skeleton width={55} height={12} />
          </Row>
          <SkeletonJobCard />
          <SkeletonJobCard />
          <SkeletonJobCard />
        </View>

        {/* Pending Requests */}
        <View style={{ marginBottom: 20 }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <Row style={{ gap: 8 }}>
              <Skeleton circle width={8} />
              <Skeleton width={120} height={16} />
            </Row>
            <Skeleton width={55} height={12} />
          </Row>
          <SkeletonRequestCard />
          <SkeletonRequestCard />
        </View>

        {/* Quick Actions */}
        <View style={{ marginBottom: 20 }}>
          <Row style={{ gap: 8, marginBottom: 12 }}>
            <Skeleton circle width={8} />
            <Skeleton width={100} height={16} />
          </Row>
          <Row style={{ flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
            {[1, 2, 3, 4].map(i => (
              <View key={i} style={s.quickAction}>
                <Skeleton circle width={44} />
                <Skeleton width={80} height={12} style={{ marginTop: 10 }} />
              </View>
            ))}
          </Row>
        </View>
      </View>
    </SkeletonGroup>
  );
}

/** Client home screen skeleton body */
export function SkeletonClientHome() {
  return (
    <SkeletonGroup>
      <View style={s.screen}>
        {/* Stats Grid */}
        <View style={{ marginBottom: 24 }}>
          <Row style={{ gap: 8, marginBottom: 14 }}>
            <Skeleton circle width={8} />
            <Skeleton width={70} height={16} />
          </Row>
          <Row style={{ gap: 12 }}>
            <SkeletonStatCard />
            <SkeletonStatCard />
          </Row>
          <Row style={{ gap: 12, marginTop: 12 }}>
            <SkeletonStatCard />
            <SkeletonStatCard />
          </Row>
          {/* Most Used Service */}
          <Card style={{ flexDirection: 'row', marginTop: 4, alignItems: 'center', gap: 12 }}>
            <Skeleton circle width={36} />
            <View style={{ flex: 1 }}>
              <Skeleton width={110} height={11} />
              <Skeleton width={80} height={14} style={{ marginTop: 4 }} />
            </View>
          </Card>
        </View>

        {/* Chart placeholder */}
        <View style={{ marginBottom: 24 }}>
          <Row style={{ gap: 8, marginBottom: 14 }}>
            <Skeleton circle width={8} />
            <Skeleton width={130} height={16} />
          </Row>
          <Card>
            <Skeleton width="100%" height={200} borderRadius={12} />
            <Skeleton width={160} height={11} style={{ marginTop: 8, alignSelf: 'center' }} />
          </Card>
        </View>

        {/* Recent Bookings */}
        <View style={{ marginBottom: 24 }}>
          <Row style={{ gap: 8, justifyContent: 'space-between', marginBottom: 14 }}>
            <Row style={{ gap: 8 }}>
              <Skeleton circle width={8} />
              <Skeleton width={120} height={16} />
            </Row>
            <Skeleton width={55} height={12} />
          </Row>
          <SkeletonBookingCard />
          <SkeletonBookingCard />
        </View>
      </View>
    </SkeletonGroup>
  );
}

/** Booking list skeleton body — 3–4 cards */
export function SkeletonBookingList({ count = 4 }: { count?: number }) {
  return (
    <SkeletonGroup>
      <View style={s.screen}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonBookingCard key={i} />
        ))}
      </View>
    </SkeletonGroup>
  );
}

/** Request list skeleton body */
export function SkeletonRequestList({ count = 3 }: { count?: number }) {
  return (
    <SkeletonGroup>
      <View style={s.screen}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonRequestCard key={i} />
        ))}
      </View>
    </SkeletonGroup>
  );
}

/** Emergency list skeleton body */
export function SkeletonEmergencyList() {
  return (
    <SkeletonGroup>
      <View style={s.screen}>
        <SkeletonEmergencyCard />
        <SkeletonEmergencyCard />
      </View>
    </SkeletonGroup>
  );
}

/** Profile page skeleton (client / mechanic / shopowner / mechanicShop) */
export function SkeletonProfile() {
  return (
    <SkeletonGroup>
      <View style={s.screen}>
        {/* Profile Card */}
        <Card style={{ borderRadius: 20, padding: 24, alignItems: 'center' }}>
          <Skeleton circle width={88} />
          <Skeleton width={140} height={18} style={{ marginTop: 14 }} />
          <Skeleton width={180} height={12} style={{ marginTop: 8 }} />
          {/* Chips */}
          <Row style={{ marginTop: 12, gap: 8 }}>
            <Skeleton width={90} height={26} borderRadius={13} />
            <Skeleton width={70} height={26} borderRadius={13} />
          </Row>
          {/* Address */}
          <Row style={{ marginTop: 12 }}>
            <Skeleton width={14} height={14} borderRadius={3} />
            <Skeleton width="70%" height={12} style={{ marginLeft: 8 }} />
          </Row>
          {/* Edit button */}
          <Skeleton width={120} height={36} borderRadius={18} style={{ marginTop: 14 }} />
        </Card>

        {/* Switch Role */}
        <Card style={{ borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Skeleton circle width={36} />
          <View style={{ flex: 1 }}>
            <Skeleton width={90} height={14} />
            <Skeleton width={60} height={11} style={{ marginTop: 4 }} />
          </View>
          <Skeleton width={14} height={14} borderRadius={3} />
        </Card>

        {/* Settings */}
        <Card style={{ borderRadius: 16, padding: 0 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <View key={i} style={[s.menuRow, i < 5 && s.menuRowBorder]}>
              <Skeleton circle width={32} />
              <Skeleton width={100} height={14} style={{ flex: 1, marginLeft: 12 }} />
              <Skeleton width={14} height={14} borderRadius={3} />
            </View>
          ))}
        </Card>

        {/* Logout */}
        <Skeleton width="100%" height={48} borderRadius={14} style={{ marginTop: 4 }} />
      </View>
    </SkeletonGroup>
  );
}

/** Dashboard skeleton — shopowner home / mechanicShop home */
export function SkeletonDashboard() {
  return (
    <SkeletonGroup>
      <View style={s.screen}>
        {/* Header */}
        <View style={{ marginBottom: 20 }}>
          <Skeleton width={120} height={20} />
          <Skeleton width={160} height={14} style={{ marginTop: 6 }} />
        </View>

        {/* Stats Grid 2x2 */}
        <Row style={{ gap: 12, marginBottom: 12 }}>
          <SkeletonStatCard />
          <SkeletonStatCard />
        </Row>
        <Row style={{ gap: 12, marginBottom: 16 }}>
          <SkeletonStatCard />
          <SkeletonStatCard />
        </Row>

        {/* Revenue Card */}
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Skeleton circle width={44} />
          <View style={{ flex: 1 }}>
            <Skeleton width={100} height={12} />
            <Skeleton width={130} height={22} style={{ marginTop: 6 }} />
          </View>
        </Card>

        {/* Rating Card */}
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Skeleton circle width={44} />
          <View style={{ flex: 1 }}>
            <Skeleton width={100} height={12} />
            <Skeleton width={80} height={22} style={{ marginTop: 6 }} />
            <Row style={{ marginTop: 6, gap: 4 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} width={16} height={16} borderRadius={3} />
              ))}
            </Row>
          </View>
        </Card>

        {/* Summary Card */}
        <Card>
          <Skeleton width={150} height={16} style={{ marginBottom: 12 }} />
          {[1, 2, 3].map(i => (
            <Row key={i} style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <Skeleton width={90} height={12} />
              <Skeleton width={40} height={14} />
            </Row>
          ))}
        </Card>
      </View>
    </SkeletonGroup>
  );
}

/** Discover list skeleton — renders cards based on active tab type */
export function SkeletonDiscoverList({ variant = 'mechanics' }: { variant?: 'mechanics' | 'shops' | 'services' }) {
  const count = 4;
  const CardComponent =
    variant === 'shops' ? SkeletonDiscoverShopCard
    : variant === 'services' ? SkeletonDiscoverServiceCard
    : SkeletonDiscoverMechanicCard;

  return (
    <SkeletonGroup>
      <View>
        {Array.from({ length: count }).map((_, i) => (
          <CardComponent key={i} />
        ))}
      </View>
    </SkeletonGroup>
  );
}

/** Detail page skeleton — booking details, mechanic/shop/service profiles */
export function SkeletonDetailPage() {
  return (
    <SkeletonGroup>
      <View style={s.screen}>
        {/* Status / Hero Card */}
        <Card style={{ alignItems: 'center', padding: 20 }}>
          <Skeleton circle width={56} />
          <Skeleton width={90} height={22} borderRadius={11} style={{ marginTop: 12 }} />
          <Skeleton width={140} height={14} style={{ marginTop: 8 }} />
          <Skeleton width={100} height={24} style={{ marginTop: 10 }} />
        </Card>

        {/* Info Section 1 */}
        <Card>
          <Row style={{ gap: 10, marginBottom: 14 }}>
            <Skeleton circle width={36} />
            <Skeleton width={160} height={16} />
          </Row>
          <View style={{ gap: 10, paddingLeft: 46 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Skeleton width={50} height={11} />
              <Skeleton width={120} height={12} />
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Skeleton width={50} height={11} />
              <Skeleton width={150} height={12} />
            </Row>
          </View>
        </Card>

        {/* Info Section 2 */}
        <Card>
          <Row style={{ gap: 10, marginBottom: 14 }}>
            <Skeleton circle width={36} />
            <Skeleton width={130} height={16} />
          </Row>
          <View style={{ gap: 8, paddingLeft: 46 }}>
            {[1, 2, 3, 4].map(i => (
              <Row key={i} style={{ justifyContent: 'space-between' }}>
                <Skeleton width={60} height={11} />
                <Skeleton width="50%" height={12} />
              </Row>
            ))}
          </View>
        </Card>
      </View>
    </SkeletonGroup>
  );
}

/** Mechanic card list skeleton — shopowner mechanics */
export function SkeletonMechanicList({ count = 3 }: { count?: number }) {
  return (
    <SkeletonGroup>
      <View style={s.screen}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonMechanicCard key={i} />
        ))}
      </View>
    </SkeletonGroup>
  );
}

/** Map job list skeleton */
export function SkeletonMapJobList() {
  return (
    <SkeletonGroup>
      <View style={s.screen}>
        <SkeletonMapCard />
        <SkeletonMapCard />
      </View>
    </SkeletonGroup>
  );
}

/** MechanicShop home skeleton */
export function SkeletonMechanicShopHome() {
  return (
    <SkeletonGroup>
      <View style={s.screen}>
        {/* Shop Header */}
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Skeleton circle width={40} />
          <View style={{ flex: 1 }}>
            <Skeleton width={80} height={11} />
            <Skeleton width={140} height={16} style={{ marginTop: 4 }} />
          </View>
        </Card>

        {/* Welcome */}
        <View style={{ marginBottom: 16 }}>
          <Skeleton width={100} height={14} />
          <Skeleton width={160} height={20} style={{ marginTop: 4 }} />
          <Skeleton width={80} height={22} borderRadius={11} style={{ marginTop: 8 }} />
        </View>

        {/* Stats Row */}
        <Row style={{ gap: 10, marginBottom: 20 }}>
          {[1, 2, 3].map(i => (
            <View key={i} style={[s.statCard, { flex: 1 }]}>
              <Skeleton circle width={32} />
              <Skeleton width={40} height={18} style={{ marginTop: 8 }} />
              <Skeleton width={60} height={10} style={{ marginTop: 4 }} />
            </View>
          ))}
        </Row>

        {/* Quick Actions */}
        <View style={{ gap: 8, marginBottom: 20 }}>
          <Row style={{ gap: 8 }}>
            <Skeleton circle width={8} />
            <Skeleton width={100} height={16} />
          </Row>
          {[1, 2, 3].map(i => (
            <Card key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Skeleton circle width={40} />
              <View style={{ flex: 1 }}>
                <Skeleton width={120} height={14} />
                <Skeleton width={160} height={11} style={{ marginTop: 4 }} />
              </View>
              <Skeleton width={14} height={14} borderRadius={3} />
            </Card>
          ))}
        </View>
      </View>
    </SkeletonGroup>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#222426',
  },
  cardDivider: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2A2C2E',
  },
  screen: {
    paddingTop: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    alignItems: 'center',
  },
  quickAction: {
    width: '48.5%',
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    alignItems: 'center',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#2A2C2E',
  },
});

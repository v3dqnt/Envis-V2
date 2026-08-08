import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, SafeAreaView, RefreshControl } from 'react-native';
import { WarningCircle, Info, Lightning, MapPin } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import GlassPanel from '../../components/ui/GlassPanel';
import AlertBadge from '../../components/ui/AlertBadge';
import ShimmerLoader from '../../components/ui/ShimmerLoader';
import { sharedStyles } from '../../lib/styles';

interface AlertData {
  id: string;
  hazard_type: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  message: string;
  city_name: string;
  published_at: string;
}

export default function NoticeBoardScreen() {
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = async () => {
    try {
      // Fetch latest active alerts from the database
      const { data, error } = await supabase
        .from('alerts_view')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('published_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching alerts:', error.message);
      } else {
        setAlerts(data || []);
      }
    } catch (err) {
      console.error('Failed to load alerts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    
    // Subscribe to real-time changes
    const subscription = supabase
      .channel('public:alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => {
        fetchAlerts();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAlerts();
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return colors.red[500];
      case 'medium': return colors.amber[500];
      default: return colors.emerald[500];
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return <WarningCircle size={20} color={colors.red[500]} weight="fill" />;
      case 'medium': return <Lightning size={20} color={colors.amber[500]} weight="fill" />;
      default: return <Info size={20} color={colors.emerald[500]} weight="fill" />;
    }
  };

  const renderAlertCard = ({ item }: { item: AlertData }) => {
    const alertColor = getSeverityColor(item.severity);
    const formattedDate = new Date(item.published_at).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });

    return (
      <GlassPanel style={[styles.alertCard, { borderColor: `${alertColor}40` }]}>
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            {getSeverityIcon(item.severity)}
            <Text style={styles.hazardType}>{item.hazard_type}</Text>
          </View>
          <AlertBadge 
            level={item.severity === 'high' ? 'red' : item.severity === 'medium' ? 'orange' : 'green'} 
            label={item.severity} 
          />
        </View>

        <Text style={styles.alertTitle}>{item.title}</Text>
        <Text style={styles.alertMessage}>{item.message}</Text>
        
        <View style={styles.cardFooter}>
          <View style={styles.locationContainer}>
            <MapPin size={12} color={colors.neutral[400]} />
            <Text style={styles.locationText}>{item.city_name || 'Regional Broadcast'}</Text>
          </View>
          <Text style={styles.timeText}>{formattedDate}</Text>
        </View>
      </GlassPanel>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <Text style={styles.brandTitle}>GAIA</Text>
        <Text style={styles.subTitle}>CENTRAL NOTICE BOARD</Text>
      </View>

      {/* Alert List */}
      <View style={styles.listContainer}>
        {loading ? (
          <View style={{ gap: 16 }}>
            <ShimmerLoader height={120} borderRadius={16} />
            <ShimmerLoader height={120} borderRadius={16} />
            <ShimmerLoader height={120} borderRadius={16} />
          </View>
        ) : alerts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Info size={48} color={colors.neutral[600]} weight="duotone" />
            <Text style={styles.emptyText}>No Active Alerts</Text>
            <Text style={styles.emptySubText}>The dashboard has not transmitted any active warnings.</Text>
          </View>
        ) : (
          <FlatList
            data={alerts}
            keyExtractor={(item) => item.id}
            renderItem={renderAlertCard}
            contentContainerStyle={styles.flatListContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.emerald[500]}
                colors={[colors.emerald[500]]}
              />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070709', // Deep space dark background
  },
  headerContainer: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(7, 7, 9, 0.8)',
    zIndex: 10,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 2,
  },
  subTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.emerald[400],
    letterSpacing: 1.5,
    marginTop: 4,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  flatListContent: {
    paddingBottom: 40,
    gap: 16,
  },
  alertCard: {
    padding: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hazardType: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  alertMessage: {
    fontSize: 13,
    color: colors.neutral[300],
    lineHeight: 20,
    marginBottom: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.neutral[400],
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.neutral[500],
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.neutral[400],
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 13,
    color: colors.neutral[600],
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  }
});

import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { X, Warning } from 'phosphor-react-native';
import * as Location from 'expo-location';
import { colors } from '../lib/theme';
import GlassPanel from './ui/GlassPanel';
import GradientButton from './ui/GradientButton';

interface ReportIncidentModalProps {
  visible: boolean;
  onClose: () => void;
}

const INCIDENT_CATEGORIES = [
  'Roadblock/Debris',
  'Flooding',
  'Fire/Smoke',
  'Structural Collapse',
  'Chemical Spill',
  'Blizzard',
  'Volcanic Eruption',
  'Other Hazard',
];

export default function ReportIncidentModal({ visible, onClose }: ReportIncidentModalProps) {
  const [selectedType, setSelectedType] = useState('Roadblock/Debris');
  const [details, setDetails] = useState('');
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [loadingCoords, setLoadingCoords] = useState(false);

  useEffect(() => {
    if (visible) {
      setLoadingCoords(true);
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then(pos => {
          setCoords([pos.coords.longitude, pos.coords.latitude]);
        })
        .catch(err => {
          console.warn('Could not grab current position for report:', err);
        })
        .finally(() => {
          setLoadingCoords(false);
        });
    }
  }, [visible]);

  const handleSubmit = () => {
    console.log('--- Aegis Tactical Report Submitted ---');
    console.log('Category:', selectedType);
    console.log('Coordinates:', coords);
    console.log('Description:', details);
    console.log('----------------------------------------');
    
    // Clear and close
    setDetails('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalBg}
      >
        <GlassPanel style={styles.modalCard} noPadding>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.titleGroup}>
              <Warning size={20} color={colors.red[400]} weight="fill" />
              <Text style={styles.title}>Submit Tactical Alert</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={colors.neutral[300]} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Category Select */}
            <Text style={styles.sectionTitle}>Select Threat Category</Text>
            <View style={styles.categoriesGrid}>
              {INCIDENT_CATEGORIES.map((cat) => {
                const isSelected = selectedType === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setSelectedType(cat)}
                    style={[
                      styles.categoryBadge,
                      isSelected ? styles.categorySelected : styles.categoryUnselected,
                    ]}
                  >
                    <Text style={[
                      styles.categoryText,
                      isSelected ? styles.categoryTextSelected : styles.categoryTextUnselected,
                    ]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* GPS Lock */}
            <Text style={styles.sectionTitle}>Spatial Coords</Text>
            <View style={styles.coordsCard}>
              <Text style={styles.coordsLabel}>Lock Target Status:</Text>
              <Text style={styles.coordsValue}>
                {loadingCoords 
                  ? 'Synchronizing GPS...' 
                  : coords 
                  ? `[${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}]` 
                  : 'GPS Signal Offline (Using center region)'}
              </Text>
            </View>

            {/* Details Input */}
            <Text style={styles.sectionTitle}>Threat Description & Context</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Report road closures, structural vulnerabilities, or immediate local hazards..."
              placeholderTextColor={colors.neutral[500]}
              multiline
              numberOfLines={4}
              value={details}
              onChangeText={setDetails}
            />

            {/* Submit */}
            <GradientButton
              title="Broadcast Tactical Alert"
              variant="red"
              onPress={handleSubmit}
              fullWidth
              style={styles.submitBtn}
            />
          </ScrollView>
        </GlassPanel>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '85%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  closeBtn: {
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  scrollContent: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.neutral[400],
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryUnselected: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  categorySelected: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: colors.red[400],
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '700',
  },
  categoryTextUnselected: {
    color: colors.neutral[400],
  },
  categoryTextSelected: {
    color: '#ffffff',
  },
  coordsCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coordsLabel: {
    color: colors.neutral[400],
    fontSize: 10,
    fontWeight: '700',
  },
  coordsValue: {
    color: colors.emerald[400],
    fontSize: 10,
    fontWeight: '800',
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    color: '#ffffff',
    fontSize: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitBtn: {
    marginTop: 24,
    marginBottom: 16,
  }
});

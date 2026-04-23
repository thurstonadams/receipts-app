import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Entity } from '../types';
import { EntityBadge } from './EntityBadge';
import { Icon } from './Icon';

export function EntityPill({ entity, onPress }: { entity: Entity; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.6 }]}>
      <EntityBadge entity={entity} size={24} />
      <View style={styles.label}>
        <Text style={styles.kicker}>BOOK</Text>
        <Text style={styles.name}>{entity.short}</Text>
      </View>
      <Icon name="chevronDown" size={14} color="rgba(60,60,67,0.5)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 10,
    paddingLeft: 4,
    borderRadius: 99,
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: 'rgba(60,60,67,0.1)',
    gap: 8,
  },
  label: {
    alignItems: 'flex-start',
  },
  kicker: {
    fontSize: 9,
    color: 'rgba(60,60,67,0.55)',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  name: {
    fontSize: 13,
    color: '#000',
    fontWeight: '600',
    letterSpacing: -0.1,
    marginTop: 1,
  },
});

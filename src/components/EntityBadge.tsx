import React from 'react';
import { View, Text } from 'react-native';
import { Entity } from '../types';

export function EntityBadge({ entity, size = 28 }: { entity: Entity; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.29,
        backgroundColor: entity.color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: '#fff',
          fontSize: size * 0.38,
          fontWeight: '700',
          letterSpacing: -0.2,
        }}
      >
        {entity.mark}
      </Text>
    </View>
  );
}

// Icon wrapper — maps the design prototype's icon names onto Ionicons.
import React from 'react';
import { Ionicons } from '@expo/vector-icons';

export type IconName =
  | 'camera'
  | 'plus'
  | 'check'
  | 'clock'
  | 'alert'
  | 'chevron'
  | 'chevronDown'
  | 'chevronLeft'
  | 'search'
  | 'filter'
  | 'sync'
  | 'bolt'
  | 'flash'
  | 'layers'
  | 'folder'
  | 'card'
  | 'grid'
  | 'xMark'
  | 'tag'
  | 'user'
  | 'home'
  | 'send'
  | 'receipt'
  | 'mail'
  | 'document'
  | 'ellipsis';

const map: Record<IconName, keyof typeof Ionicons.glyphMap> = {
  camera: 'camera-outline',
  plus: 'add',
  check: 'checkmark',
  clock: 'time-outline',
  alert: 'alert-circle-outline',
  chevron: 'chevron-forward',
  chevronDown: 'chevron-down',
  chevronLeft: 'chevron-back',
  search: 'search',
  filter: 'options-outline',
  sync: 'sync',
  bolt: 'flash',
  flash: 'flash',
  layers: 'layers-outline',
  folder: 'folder-outline',
  card: 'card-outline',
  grid: 'grid-outline',
  xMark: 'close',
  tag: 'pricetag-outline',
  user: 'person-outline',
  home: 'home-outline',
  send: 'paper-plane',
  receipt: 'receipt-outline',
  mail: 'mail-outline',
  document: 'document-text-outline',
  ellipsis: 'ellipsis-horizontal',
};

interface Props {
  name: IconName;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 20, color = '#000' }: Props) {
  return <Ionicons name={map[name]} size={size} color={color} />;
}

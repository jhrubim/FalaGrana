import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import DashboardScreen from '../screens/home/DashboardScreen';
import LancamentosScreen from '../screens/lancamentos/LancamentosScreen';
import ImportarScreen from '../screens/importacao/ImportarScreen';
import RelatoriosScreen from '../screens/relatorios/RelatoriosScreen';
import MaisScreen from '../screens/mais/MaisScreen';
import { colors } from '../constants/colors';

export type AppTabsParamList = {
  Home: undefined;
  Lancamentos: undefined;
  Importar: undefined;
  Relatorios: undefined;
  Mais: undefined;
};

const Tab = createBottomTabNavigator<AppTabsParamList>();

const TAB_ITEMS: Array<{
  name: keyof AppTabsParamList;
  label: string;
  icon: string;
}> = [
  { name: 'Home',        label: 'Início',      icon: '⌂' },
  { name: 'Lancamentos', label: 'Lançamentos',  icon: '↕' },
  { name: 'Importar',    label: 'Importar',     icon: '↑' },
  { name: 'Relatorios',  label: 'Relatórios',   icon: '▤' },
  { name: 'Mais',        label: 'Mais',         icon: '⋯' },
];

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.tabBar}>
      <View style={styles.tabRow}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const item = TAB_ITEMS.find((t) => t.name === route.name);

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={[styles.tabItem, isFocused && styles.tabItemActive]}
              accessibilityRole="button"
              accessibilityLabel={options.tabBarAccessibilityLabel ?? item?.label}
              accessibilityState={{ selected: isFocused }}
            >
              <Text style={[styles.tabIcon, isFocused && styles.tabIconActive]}>
                {item?.icon ?? '•'}
              </Text>
              <Text
                style={[styles.tabLabel, isFocused && styles.tabLabelActive]}
                numberOfLines={1}
              >
                {item?.label ?? route.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function AppTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.bg.surface,
          borderBottomColor: colors.border.default,
          borderBottomWidth: 1,
        },
        headerTintColor: colors.text.primary,
        headerTitleStyle: {
          fontSize: 20,
          fontWeight: '500',
          color: colors.text.primary,
        },
      }}
    >
      <Tab.Screen name="Home"        component={DashboardScreen}  options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Lancamentos" component={LancamentosScreen} options={{ title: 'Lançamentos' }} />
      <Tab.Screen name="Importar"    component={ImportarScreen}   options={{ title: 'Importar' }} />
      <Tab.Screen name="Relatorios"  component={RelatoriosScreen}  options={{ title: 'Relatórios' }} />
      <Tab.Screen name="Mais"        component={MaisScreen}       options={{ title: 'Mais' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bg.base,
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
    paddingHorizontal: 10,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    gap: 2,
  },
  tabItemActive: {
    backgroundColor: colors.bg.elevated,
    borderColor: colors.green,
  },
  tabIcon: {
    fontSize: 16,
    color: colors.text.secondary,
  },
  tabIconActive: {
    color: colors.green,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tabLabelActive: {
    color: colors.green,
  },
});

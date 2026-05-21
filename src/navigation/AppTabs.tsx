import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import DashboardScreen from '../screens/home/DashboardScreen';
import LancamentosScreen from '../screens/lancamentos/LancamentosScreen';
import ImportarScreen from '../screens/importacao/ImportarScreen';
import RelatoriosScreen from '../screens/relatorios/RelatoriosScreen';
import MaisScreen from '../screens/mais/MaisScreen';
import { useAppTheme } from '../context/ThemeContext';

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
  const { colors: c } = useAppTheme();

  return (
    <View style={{
      backgroundColor: c.bg,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingHorizontal: 10,
      paddingBottom: 8,
      paddingTop: 8,
    }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
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
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 8,
                borderRadius: 12,
                backgroundColor: isFocused ? c.elevated : c.surface,
                borderWidth: 1,
                borderColor: isFocused ? c.accent : c.border,
                gap: 2,
              }}
              accessibilityRole="button"
              accessibilityLabel={options.tabBarAccessibilityLabel ?? item?.label}
              accessibilityState={{ selected: isFocused }}
            >
              <Text style={{ fontSize: 16, color: isFocused ? c.accent : c.muted }}>
                {item?.icon ?? '•'}
              </Text>
              <Text style={{
                fontSize: 9, fontWeight: '500',
                color: isFocused ? c.accent : c.muted,
                textTransform: 'uppercase', letterSpacing: 0.4,
              }} numberOfLines={1}>
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
  const { colors: c } = useAppTheme();

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: c.surface,
          borderBottomColor: c.border,
          borderBottomWidth: 1,
        },
        headerTintColor: c.text,
        headerTitleStyle: {
          fontSize: 20,
          fontWeight: '500',
          color: c.text,
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

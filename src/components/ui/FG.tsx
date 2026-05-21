// src/components/ui/FG.tsx
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type PressableProps,
  type ScrollViewProps,
  type TextInputProps,
  type ViewProps,
} from 'react-native';
import { fg } from '../../theme/fgTheme';

export function FGScrollScreen(props: ScrollViewProps & { padded?: boolean }) {
  const { style, contentContainerStyle, padded = true, children, ...rest } = props;
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const pad = isDesktop ? 28 : fg.spacing.screen;

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: fg.colors.bg }, style]}
      contentContainerStyle={[
        padded ? { padding: pad, paddingBottom: fg.spacing.screenBottom, alignItems: isDesktop ? 'center' : undefined } : null,
        contentContainerStyle,
      ]}
      {...rest}
    >
      <View style={{ width: '100%', maxWidth: isDesktop ? 960 : undefined, alignSelf: isDesktop ? 'center' : undefined }}>
        {children}
      </View>
    </ScrollView>
  );
}

export function FGCentered(props: ViewProps & { message?: string }) {
  const { style, message, children, ...rest } = props;
  return (
    <View style={[styles.centered, style]} {...rest}>
      {children}
      {message ? <Text style={styles.centeredText}>{message}</Text> : null}
    </View>
  );
}

export function FGCard(props: ViewProps & { glow?: boolean; noShadow?: boolean }) {
  const { style, glow, noShadow, ...rest } = props;
  return (
    <View style={[styles.card, !noShadow ? fg.shadow.card : null, glow ? fg.shadow.glow : null, style]} {...rest} />
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function FGButton(
  props: PressableProps & {
    title?: string;
    variant?: ButtonVariant;
    loading?: boolean;
    disabled?: boolean;
  }
) {
  const { title, variant = 'primary', loading, disabled, style, children, ...rest } = props;

  const base =
    variant === 'primary'
      ? styles.btnPrimary
      : variant === 'secondary'
      ? styles.btnSecondary
      : variant === 'danger'
      ? styles.btnDanger
      : styles.btnGhost;

  const textStyle =
    variant === 'primary'
      ? styles.btnPrimaryText
      : variant === 'danger'
      ? styles.btnDangerText
      : styles.btnSecondaryText;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        base,
        pressed ? { opacity: 0.92 } : null,
        disabled || loading ? { opacity: 0.55 } : null,
        style,
      ]}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? fg.colors.bg : fg.colors.text} />
      ) : title ? (
        <Text style={textStyle}>{title}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function FGInput(props: TextInputProps & { compact?: boolean }) {
  const { style, compact, ...rest } = props;
  return (
    <TextInput
      style={[styles.input, compact ? styles.inputCompact : null, style]}
      placeholderTextColor={fg.colors.muted2}
      {...rest}
    />
  );
}

export function FGSelect(props: PressableProps & { valueText: string; filled?: boolean }) {
  const { valueText, filled, style, ...rest } = props;
  return (
    <Pressable style={[styles.select, style]} {...rest}>
      <Text style={[styles.selectText, filled ? styles.selectTextFilled : null]} numberOfLines={1}>
        {valueText}
      </Text>
      <Text style={styles.selectArrow}>▼</Text>
    </Pressable>
  );
}

export function FGSectionTitle(props: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{props.title}</Text>
      {props.right ? <View>{props.right}</View> : null}
    </View>
  );
}

type BadgeVariant = 'ok' | 'warn' | 'danger' | 'info';

export function FGBadge(props: { label: string; variant?: BadgeVariant }) {
  const { label, variant = 'info' } = props;

  const st =
    variant === 'ok'
      ? styles.badgeOk
      : variant === 'warn'
      ? styles.badgeWarn
      : variant === 'danger'
      ? styles.badgeDanger
      : styles.badgeInfo;

  const tx =
    variant === 'ok'
      ? styles.badgeOkText
      : variant === 'warn'
      ? styles.badgeWarnText
      : variant === 'danger'
      ? styles.badgeDangerText
      : styles.badgeInfoText;

  return (
    <View style={[styles.badge, st]}>
      <Text style={[styles.badgeText, tx]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function FGDivider() {
  return <View style={styles.divider} />;
}

// ✅ blindado: não quebra se alguém chamar sem props
export function FGHeader(props?: { title?: string; subtitle?: string; info?: string; right?: React.ReactNode }) {
  const { title = '', subtitle, info, right } = props ?? {};
  return (
    <View style={styles.headerRow}>
      <View style={{ flex: 1 }}>
        {!!title && <Text style={styles.hTitle}>{title}</Text>}
        {subtitle ? <Text style={styles.hSubtitle}>{subtitle}</Text> : null}
        {info ? <Text style={styles.hInfo}>{info}</Text> : null}
      </View>
      {right ? <View style={{ alignItems: 'flex-end' }}>{right}</View> : null}
    </View>
  );
}

export function FGAlertBox(props: { variant?: 'danger' | 'warn' | 'info'; text: string }) {
  const { variant = 'info', text } = props;

  const box = variant === 'danger' ? styles.alertDanger : variant === 'warn' ? styles.alertWarn : styles.alertInfo;

  const tx =
    variant === 'danger' ? styles.alertDangerText : variant === 'warn' ? styles.alertWarnText : styles.alertInfoText;

  return (
    <View style={[styles.alertBox, box]}>
      <Text style={[styles.alertText, tx]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: fg.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centeredText: { marginTop: 10, color: fg.colors.muted, fontWeight: '800', fontSize: 12 },

  card: {
    backgroundColor: fg.colors.surface,
    borderRadius: fg.radius.lg,
    borderWidth: 1,
    borderColor: fg.colors.borderSoft,
    padding: fg.spacing.card,
  },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  hTitle: { color: fg.colors.text, ...fg.typography.title },
  hSubtitle: { marginTop: 2, color: fg.colors.text, ...fg.typography.subtitle, opacity: 0.92 },
  hInfo: { marginTop: 4, color: fg.colors.muted, ...fg.typography.subInfo },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { color: fg.colors.text, ...fg.typography.section },

  btn: { borderRadius: fg.radius.md, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  btnPrimary: { backgroundColor: fg.colors.accent, borderWidth: 1, borderColor: 'rgba(34,211,139,0.35)' },
  btnSecondary: { backgroundColor: fg.colors.surface2, borderWidth: 1, borderColor: fg.colors.border },
  btnDanger: { backgroundColor: 'rgba(255,77,109,0.16)', borderWidth: 1, borderColor: 'rgba(255,77,109,0.35)' },
  btnGhost: { backgroundColor: fg.colors.transparent, borderWidth: 1, borderColor: fg.colors.border },

  btnPrimaryText: { color: fg.colors.bg, fontWeight: '900', fontSize: 13 },
  btnSecondaryText: { color: fg.colors.text, fontWeight: '900', fontSize: 13 },
  btnDangerText: { color: fg.colors.danger, fontWeight: '900', fontSize: 13 },

  input: {
    borderWidth: 1,
    borderColor: fg.colors.border,
    borderRadius: fg.radius.md,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
    backgroundColor: fg.colors.surface2,
    color: fg.colors.text,
    fontWeight: '800',
  },
  inputCompact: { paddingVertical: Platform.OS === 'web' ? 8 : 10 },

  select: {
    borderWidth: 1,
    borderColor: fg.colors.border,
    borderRadius: fg.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: fg.colors.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectText: { color: fg.colors.muted2, fontWeight: '900', fontSize: 13, flex: 1 },
  selectTextFilled: { color: fg.colors.text },
  selectArrow: { color: fg.colors.muted, fontWeight: '900' },

  badge: { borderRadius: fg.radius.pill, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '900' },

  badgeOk: { backgroundColor: 'rgba(34,211,139,0.16)', borderColor: 'rgba(34,211,139,0.30)' },
  badgeOkText: { color: fg.colors.accent },

  badgeWarn: { backgroundColor: 'rgba(251,191,36,0.16)', borderColor: 'rgba(251,191,36,0.30)' },
  badgeWarnText: { color: fg.colors.warning },

  badgeDanger: { backgroundColor: 'rgba(255,77,109,0.16)', borderColor: 'rgba(255,77,109,0.30)' },
  badgeDangerText: { color: fg.colors.danger },

  badgeInfo: { backgroundColor: 'rgba(18,181,255,0.14)', borderColor: 'rgba(18,181,255,0.28)' },
  badgeInfoText: { color: fg.colors.accent2 },

  divider: { height: 1, backgroundColor: fg.colors.borderSoft },

  alertBox: { borderRadius: fg.radius.md, padding: 10, borderWidth: 1, marginBottom: 10 },
  alertText: { fontWeight: '900', fontSize: 12 },

  alertDanger: { backgroundColor: 'rgba(255,77,109,0.12)', borderColor: 'rgba(255,77,109,0.28)' },
  alertDangerText: { color: fg.colors.danger },

  alertWarn: { backgroundColor: 'rgba(251,191,36,0.14)', borderColor: 'rgba(251,191,36,0.28)' },
  alertWarnText: { color: fg.colors.warning },

  alertInfo: { backgroundColor: 'rgba(18,181,255,0.12)', borderColor: 'rgba(18,181,255,0.26)' },
  alertInfoText: { color: fg.colors.accent2 },
});
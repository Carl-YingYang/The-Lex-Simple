// ============================================================
// src/components/Neo.tsx
// NEO-BRUTALISM PRIMITIVES — VERSION: 1.2.0 (PURPLE SPEC)
// ============================================================
// Single source of truth para sa neo-brutalist building blocks.
//
// v1.2.0 CHANGES (purple neo-brutalist spec):
//   - Standard surfaces: 1.5px border (dating 2px) — card, badge,
//     chip, icon button, input. CTA buttons panatilihang 2px.
//   - Radius: squared na (RADIUS tokens: 3/4/6) — spec 2–6px.
//   - NeoCard 'raised' shadow: 4px → 2px (spec: 2–3px lang sa focal).
//   - 'accent' variant: yellow → VIVID PURPLE (brandVivid) + itim na
//     label. BAWAL na ang dilaw sa purple system.
//   - 'soft' variant text: brand → brandDeep (Deep Purple sa lavender).
//
// RULES NG FILE NA ITO:
//   1. ZERO hardcoded hex — lahat ng kulay galing sa useTheme()
//      (colors.*) na naka-wire sa src/theme/tokens.ts (light +
//      dark brutalism themes). Auto-adjust sa theme switch.
//   2. Hard shadows, ZERO blur:
//        iOS     = shadowOffset + shadowRadius: 0 + shadowOpacity: 1
//        Android = elevation (approximation lang — mas malambot
//                  talaga sa Android, expected behavior iyan)
//   3. Press behavior = "sink into paper": nag-translate pababa-
//      kanan hanggang pantay sa shadow offset, tapos nawawala ang
//      shadow. Classic neo-brutalist interaction.
//   4. Lahat ng label na may text ay ALL-CAPS via textTransform
//      (hindi .toUpperCase()) para intact ang original string sa
//      accessibility at copy-paste.
//
// IMPORT SA SCREENS:
//   import { NeoButton, NeoCard, NeoBadge, NeoChip, NeoIconButton,
//            NeoDivider, NeoSectionHeader, NeoInput,
//            getNeoShadow } from '../../components/Neo';
//   (i-adjust ang relative path base sa lalim ng screen)
// ============================================================

import React from 'react';
import {
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import type {
    StyleProp,
    TextInputProps,
    TextStyle,
    ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeContext';
import { SPACING, RADIUS, BORDER, SHADOW, TYPE } from '../theme/tokens';
import type { ThemeColors } from '../theme/tokens';

// ------------------------------------------------------------
// TYPES
// ------------------------------------------------------------

type ShadowLevel = 'sm' | 'md' | 'lg';

export type NeoButtonVariant =
    | 'primary'    // Primary Purple #7C3AED + itim na text — main CTA (spec)
    | 'accent'     // Vivid Purple #8B5CF6 + itim na text — hero/split CTA (spec; dating yellow)
    | 'secondary'  // card bg — neutral action
    | 'soft'       // Pale Lavender bg + Deep Purple text — calm action
    | 'danger'     // red tint bg — destructive
    | 'ghost';     // transparent, thin border — tertiary

export type NeoButtonSize = 'sm' | 'md' | 'lg';

export type NeoBadgeVariant =
    | 'neutral'
    | 'brand'
    | 'highlight'  // DEPRECATED (dating yellow) — huwag gamitin sa purple system
    | 'success'
    | 'warning'
    | 'info'
    | 'danger';

export type NeoIconButtonVariant = 'default' | 'brand' | 'danger';

export type NeoInputStatus = 'default' | 'success' | 'danger';

// ------------------------------------------------------------
// SHADOW HELPERS (export — pwedeng gamitin ng mga screens
// para sa custom na may-hard-shadow na elements)
// ------------------------------------------------------------

/**
 * Hard shadow, zero blur. iOS = shadow props; Android = elevation.
 * Kulay: colors.shadow — ang dedikadong shadow token ng tokens.ts
 * (maitim sa light mode, malapit-puti sa dark mode = inverted brutalism).
 */
export function getNeoShadow(
    colors: ThemeColors,
    level: ShadowLevel = 'md',
): ViewStyle {
    if (Platform.OS === 'android') {
        return { elevation: SHADOW[level].android };
    }
    return {
        ...SHADOW[level].ios,
        shadowColor: colors.shadow,
    };
}

/**
 * Press state: "sink into paper" — pinapantay ang element sa sarili
 * nitong shadow offset tapos zero ang shadow.
 */
function pressCollapse(
    colors: ThemeColors,
    level: ShadowLevel,
    pressed: boolean,
): ViewStyle {
    if (!pressed) {
        return getNeoShadow(colors, level);
    }
    const offset = SHADOW[level].ios.shadowOffset;
    if (Platform.OS === 'android') {
        return {
            elevation: 0,
            transform: [
                { translateX: offset.width },
                { translateY: offset.height },
            ],
        };
    }
    return {
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 0,
        shadowOpacity: 0,
        transform: [
            { translateX: offset.width },
            { translateY: offset.height },
        ],
    };
}

/**
 * Type-safe wrapper sa TYPE presets — ginagawang TextStyle kahit ano
 * pa ang exact typing ng tokens.ts (as const man o plain object).
 * Identity lang sa runtime — walang overhead.
 */
function typeStyle(preset: unknown): TextStyle {
    return preset as TextStyle;
}

// ------------------------------------------------------------
// NEO CARD
// ------------------------------------------------------------

interface NeoCardProps {
    children: React.ReactNode;
    /** Kapag may onPress → nage-instant na pressable card na may sink effect. */
    onPress?: () => void;
    /** 'raised' = may hard shadow (default); 'flat' = border lang. */
    variant?: 'raised' | 'flat';
    /** Default true — SPACING.lg padding sa lahat ng sides. */
    padding?: boolean;
    /**
     * Layout wrapper style (margins, flex). Sa non-pressable version
     * direktang naka-apply sa card, sa pressable version nasa wrapper.
     */
    style?: StyleProp<ViewStyle>;
}

/**
 * Neo-brutalist card: 1.5px standard border, 6px radius (squared — spec),
 * flat by default; 'raised' = maliit na 2px hard shadow (focal lang — spec).
 * Pwedeng static o pressable.
 */
export function NeoCard({
    children,
    onPress,
    variant = 'raised',
    padding = true,
    style,
}: NeoCardProps) {
    const { colors } = useTheme();

    // BRUTAL border = colors.ink (hindi ang legacy colors.border hairline)
    const base: StyleProp<ViewStyle> = [
        styles.brutalSurface,
        padding && styles.surfacePadding,
        {
            backgroundColor: colors.card,
            borderColor: colors.ink,
        },
    ];

    if (!onPress) {
        return (
            <View
                style={[
                    base,
                    variant === 'raised' ? getNeoShadow(colors, 'sm') : null,
                    style,
                ]}
            >
                {children}
            </View>
        );
    }

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            style={style}
        >
            {({ pressed }: { pressed: boolean }) => (
                <View
                    style={[
                        base,
                        variant === 'raised'
                            ? pressCollapse(colors, 'sm', pressed)
                            : pressed
                                ? styles.dimmed
                                : null,
                    ]}
                >
                    {children}
                </View>
            )}
        </Pressable>
    );
}

// ------------------------------------------------------------
// NEO BUTTON
// ------------------------------------------------------------

const BUTTON_SIZES: Record<
    NeoButtonSize,
    { height: number; paddingHorizontal: number; icon: number; gap: number }
> = {
    sm: { height: 36, paddingHorizontal: SPACING.md, icon: 14, gap: SPACING.xs },
    md: { height: 48, paddingHorizontal: SPACING.lg, icon: 17, gap: SPACING.sm },
    lg: { height: 56, paddingHorizontal: SPACING.xl, icon: 20, gap: SPACING.sm },
};

function buttonColors(
    colors: ThemeColors,
    variant: NeoButtonVariant,
): { bg: string; text: string; border: string } {
    switch (variant) {
        case 'primary':
            return { bg: colors.brand, text: colors.brandText, border: colors.ink };
        case 'accent':
            return { bg: colors.brandVivid, text: colors.brandText, border: colors.ink };
        case 'soft':
            return { bg: colors.brandSoft, text: colors.brandDeep, border: colors.ink };
        case 'danger':
            return { bg: colors.dangerSoft, text: colors.danger, border: colors.ink };
        case 'ghost':
            return { bg: 'transparent', text: colors.text, border: colors.border };
        case 'secondary':
        default:
            return { bg: colors.card, text: colors.text, border: colors.ink };
    }
}

function buttonText(size: NeoButtonSize): StyleProp<TextStyle> {
    if (size === 'sm') {
        return [typeStyle(TYPE.small), styles.textCaps, { fontWeight: '800' }];
    }
    if (size === 'lg') {
        return [typeStyle(TYPE.heading), styles.textCaps, { fontWeight: '900' }];
    }
    return [typeStyle(TYPE.body), styles.textCaps, { fontWeight: '800' }];
}

interface NeoButtonProps {
    label: string;
    onPress: () => void;
    variant?: NeoButtonVariant;
    size?: NeoButtonSize;
    icon?: keyof typeof Ionicons.glyphMap;
    iconPosition?: 'left' | 'right';
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
}

/**
 * Neo-brutalist button: 2px border (spec CTA), 4px radius (squared),
 * maliit na hard shadow na nagko-collapse sa press ("sink into paper").
 *
// VARIANT COLOR MAP (auto light/dark, purple spec v1.1.0):
//   primary   → brand bg + brandText       (Primary Purple CTA, itim na label)
//   accent    → brandVivid bg + brandText  (Vivid Purple CTA, itim na label — spec CTA)
//   secondary → card bg + text             (neutral)
//   soft      → brandSoft bg + brandDeep   (Pale Lavender, Deep Purple text)
//   danger    → dangerSoft bg + danger     (red tint, destructive)
//   ghost     → transparent + border       (tertiary, walang shadow)
 */
export function NeoButton({
    label,
    onPress,
    variant = 'primary',
    size = 'md',
    icon,
    iconPosition = 'left',
    disabled = false,
    style,
}: NeoButtonProps) {
    const { colors } = useTheme();
    const palette = buttonColors(colors, variant);
    const dims = BUTTON_SIZES[size];
    const isGhost = variant === 'ghost';

    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            style={style}
        >
            {({ pressed }: { pressed: boolean }) => (
                <View
                    style={[
                        styles.buttonBase,
                        {
                            height: dims.height,
                            paddingHorizontal: dims.paddingHorizontal,
                            gap: dims.gap,
                            backgroundColor: palette.bg,
                            borderColor: palette.border,
                            borderRadius: RADIUS.md,
                            borderWidth: isGhost ? BORDER.thin : BORDER.thick,
                        },
                        disabled
                            ? styles.disabled
                            : isGhost
                                ? pressed
                                    ? styles.dimmed
                                    : null
                                : pressCollapse(colors, 'sm', pressed),
                    ]}
                >
                    {icon && iconPosition === 'left' ? (
                        <Ionicons name={icon} size={dims.icon} color={palette.text} />
                    ) : null}
                    <Text
                        style={[buttonText(size), { color: palette.text }]}
                        numberOfLines={1}
                    >
                        {label}
                    </Text>
                    {icon && iconPosition === 'right' ? (
                        <Ionicons name={icon} size={dims.icon} color={palette.text} />
                    ) : null}
                </View>
            )}
        </Pressable>
    );
}

// ------------------------------------------------------------
// NEO ICON BUTTON
// ------------------------------------------------------------

interface NeoIconButtonProps {
    icon: keyof typeof Ionicons.glyphMap;
    onPress?: () => void;
    variant?: NeoIconButtonVariant;
    /** Square size sa px. Default 40. */
    size?: number;
    /** Icon size. Default: kalahati ng size. */
    iconSize?: number;
    disabled?: boolean;
    accessibilityLabel?: string;
    style?: StyleProp<ViewStyle>;
}

/**
 * Square icon button na may hard shadow — para sa headers,
 * card actions, at close buttons.
 */
export function NeoIconButton({
    icon,
    onPress,
    variant = 'default',
    size = 40,
    iconSize,
    disabled = false,
    accessibilityLabel,
    style,
}: NeoIconButtonProps) {
    const { colors } = useTheme();

    const palette =
        variant === 'brand'
            ? { bg: colors.brand, icon: colors.brandText }
            : variant === 'danger'
                ? { bg: colors.dangerSoft, icon: colors.danger }
                : { bg: colors.card, icon: colors.text };

    const resolvedIconSize = iconSize ?? Math.round(size * 0.5);

    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ disabled }}
            style={style}
        >
            {({ pressed }: { pressed: boolean }) => (
                <View
                    style={[
                        styles.iconButtonBase,
                        {
                            width: size,
                            height: size,
                            borderRadius: RADIUS.sm,
                            backgroundColor: palette.bg,
                            borderColor: colors.ink,
                        },
                        disabled
                            ? styles.disabled
                            : pressCollapse(colors, 'sm', pressed),
                    ]}
                >
                    <Ionicons
                        name={icon}
                        size={resolvedIconSize}
                        color={palette.icon}
                    />
                </View>
            )}
        </Pressable>
    );
}

// ------------------------------------------------------------
// NEO BADGE
// ------------------------------------------------------------

interface NeoBadgeProps {
    label: string;
    variant?: NeoBadgeVariant;
    icon?: keyof typeof Ionicons.glyphMap;
    style?: StyleProp<ViewStyle>;
}

/**
 * Maliit na status label — flat, 1.5px border, square-ish (3px radius).
 * Hindi pressable (para sa clickable tags, gumamit ng NeoChip).
 *
// VARIANTS: neutral | brand | highlight (DEPRECATED yellow) | success | warning | info | danger
 */
export function NeoBadge({
    label,
    variant = 'neutral',
    icon,
    style,
}: NeoBadgeProps) {
    const { colors } = useTheme();

    const palette =
        variant === 'brand'
            ? { bg: colors.brandSoft, text: colors.brand }
            : variant === 'highlight'
                ? { bg: colors.highlight, text: colors.highlightText }
                : variant === 'success'
                    ? { bg: colors.successSoft, text: colors.success }
                    : variant === 'warning'
                        ? { bg: colors.warningSoft, text: colors.warning }
                        : variant === 'info'
                            ? { bg: colors.infoSoft, text: colors.info }
                            : variant === 'danger'
                                ? { bg: colors.dangerSoft, text: colors.danger }
                                : { bg: colors.card, text: colors.text };

    return (
        <View
            style={[
                styles.badgeBase,
                { backgroundColor: palette.bg, borderColor: colors.ink },
                style,
            ]}
        >
            {icon ? (
                <Ionicons name={icon} size={12} color={palette.text} />
            ) : null}
            <Text
                style={[
                    typeStyle(TYPE.micro),
                    styles.textCaps,
                    {
                        color: palette.text,
                        fontWeight: '800',
                        letterSpacing: 0.5,
                    },
                ]}
                numberOfLines={1}
            >
                {label}
            </Text>
        </View>
    );
}

// ------------------------------------------------------------
// NEO CHIP
// ------------------------------------------------------------

interface NeoChipProps {
    label: string;
    onPress?: () => void;
    selected?: boolean;
    disabled?: boolean;
    icon?: keyof typeof Ionicons.glyphMap;
    style?: StyleProp<ViewStyle>;
}

/**
 * Pill-shaped selectable chip para sa filters at tag pickers.
 * selected = solid brand + hard shadow; unselected = card bg.
 * (Tandaan: deprecated ang pill shape sa purple spec — gamitin nang matipid.)
 */
export function NeoChip({
    label,
    onPress,
    selected = false,
    disabled = false,
    icon,
    style,
}: NeoChipProps) {
    const { colors } = useTheme();

    const bg = selected ? colors.brand : colors.card;
    const fg = selected ? colors.brandText : colors.subText;

    const renderContent = ({ pressed }: { pressed: boolean }) => (
        <View
            style={[
                styles.chipBase,
                {
                    backgroundColor: bg,
                    borderColor: colors.ink,
                },
                selected
                    ? disabled
                        ? styles.disabled
                        : pressCollapse(colors, 'sm', pressed)
                    : pressed || disabled
                        ? styles.dimmed
                        : null,
            ]}
        >
            {icon ? <Ionicons name={icon} size={14} color={fg} /> : null}
            <Text
                style={[
                    typeStyle(TYPE.small),
                    styles.textCaps,
                    { color: fg, fontWeight: '700' },
                ]}
                numberOfLines={1}
            >
                {label}
            </Text>
        </View>
    );

    if (!onPress) {
        return (
            <View style={style}>{renderContent({ pressed: false })}</View>
        );
    }

    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled, selected }}
            style={style}
        >
            {renderContent}
        </Pressable>
    );
}

// ------------------------------------------------------------
// NEO DIVIDER
// ------------------------------------------------------------

interface NeoDividerProps {
    /** true = 3px (brutal), false = 2px (thick). Default false. */
    thick?: boolean;
    style?: StyleProp<ViewStyle>;
}

/**
 * Makapal na pahalang na linya — kapalit ng hairline separators.
 * colors.ink (brutal), hindi ang legacy hairline color.
 */
export function NeoDivider({ thick = false, style }: NeoDividerProps) {
    const { colors } = useTheme();
    return (
        <View
            style={[
                {
                    height: thick ? BORDER.brutal : BORDER.thick,
                    backgroundColor: colors.ink,
                },
                style,
            ]}
        />
    );
}

// ------------------------------------------------------------
// NEO SECTION HEADER
// ------------------------------------------------------------

interface NeoSectionHeaderProps {
    title: string;
    /** I-render ang maliit na square marker sa kaliwa. Default true. */
    marker?: boolean;
    /** Kulay ng marker. Default: colors.brand. */
    markerColor?: string;
    /** Optional na right slot (hal. NeoButton na may size 'sm'). */
    action?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

/**
 * ALL-CAPS section title na may square marker — pixel-square motif
 * mula sa reference design.
 */
export function NeoSectionHeader({
    title,
    marker = true,
    markerColor,
    action,
    style,
}: NeoSectionHeaderProps) {
    const { colors } = useTheme();
    const resolvedMarker = markerColor ?? colors.brand;

    return (
        <View style={[styles.sectionHeader, style]}>
            <View style={styles.sectionHeaderLeft}>
                {marker ? (
                    <View
                        style={[
                            styles.markerSquare,
                            {
                                backgroundColor: resolvedMarker,
                                borderColor: colors.ink,
                            },
                        ]}
                    />
                ) : null}
                <Text
                    style={[
                        typeStyle(TYPE.heading),
                        styles.textCaps,
                        styles.titleFlex,
                        {
                            color: colors.text,
                            fontWeight: '900',
                            letterSpacing: 0.5,
                        },
                    ]}
                    numberOfLines={1}
                >
                    {title}
                </Text>
            </View>
            {action}
        </View>
    );
}

// ------------------------------------------------------------
// NEO INPUT
// ------------------------------------------------------------

interface NeoInputProps extends TextInputProps {
    label?: string;
    /** success/danger = nag-iiba ang border color (feedback). */
    status?: NeoInputStatus;
    containerStyle?: StyleProp<ViewStyle>;
    inputStyle?: StyleProp<TextStyle>;
}

/**
 * Labeled text input sa 1.5px-border na container (squared radius).
 * Lahat ng standard TextInput props (value, onChangeText, placeholder,
 * secureTextEntry, multiline, atbp.) ay pwedeng i-pass through.
 */
export function NeoInput({
    label,
    status = 'default',
    containerStyle,
    inputStyle,
    ...inputProps
}: NeoInputProps) {
    const { colors } = useTheme();

    const borderColor =
        status === 'success'
            ? colors.success
            : status === 'danger'
                ? colors.danger
                : colors.ink;

    return (
        <View style={containerStyle}>
            {label ? (
                <Text
                    style={[
                        typeStyle(TYPE.small),
                        styles.textCaps,
                        {
                            color: colors.subText,
                            fontWeight: '800',
                            letterSpacing: 0.5,
                            marginBottom: SPACING.xs,
                        },
                    ]}
                >
                    {label}
                </Text>
            ) : null}
            <View
                style={[
                    styles.inputBase,
                    {
                        backgroundColor: colors.card,
                        borderColor,
                    },
                ]}
            >
                <TextInput
                    placeholderTextColor={colors.subText}
                    style={[
                        typeStyle(TYPE.body),
                        {
                            color: colors.text,
                            paddingVertical: SPACING.md,
                            flexShrink: 1,
                        },
                        inputStyle,
                    ]}
                    {...inputProps}
                />
            </View>
        </View>
    );
}

// ------------------------------------------------------------
// STATIC STYLES
// ------------------------------------------------------------

const styles = StyleSheet.create({
    brutalSurface: {
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.lg,
    },
    surfacePadding: {
        padding: SPACING.lg,
    },
    buttonBase: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconButtonBase: {
        borderWidth: BORDER.thin,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeBase: {
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.sm,
        paddingHorizontal: SPACING.sm,
        paddingVertical: 3,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
    },
    chipBase: {
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.pill,
        paddingHorizontal: SPACING.md,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.xs,
        alignSelf: 'flex-start',
    },
    inputBase: {
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.md,
        paddingHorizontal: SPACING.md,
        minHeight: 48,
        justifyContent: 'center',
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sectionHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
        flexShrink: 1,
    },
    markerSquare: {
        width: 10,
        height: 10,
        borderWidth: BORDER.thin,
    },
    titleFlex: {
        flexShrink: 1,
    },
    textCaps: {
        textTransform: 'uppercase',
    },
    dimmed: {
        opacity: 0.7,
    },
    disabled: {
        opacity: 0.45,
    },
});
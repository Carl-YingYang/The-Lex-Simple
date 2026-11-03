import React from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import type { DimensionValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeContext';
import { getNeoShadow } from './Neo';
import { BORDER, RADIUS } from '../theme/tokens';

// MODAL SHEET VERSION: 2.0.0 — PURPLE NEO-BRUTALISM SPEC
// (Same modal structure at closing behavior — API at logic 1:1 pa rin.)
// Pagbabago sa UI (v2.0.0):
//   - Scrim: hardcoded rgba → T.overlay token (theme-aware).
//   - Sheet: 1.5px ink outline + squared 6px radius (dating 1px hairline
//     + 8px radius), at blur shadow → HARD shadow (getNeoShadow 'sm' —
//     modal = focal element kaya puwedeng may hard shadow).
//   - Close button: 1.5px ink outline, squared 4px (dating 1px + 6px).
interface ModalSheetProps {
    title: string;
    iconName: string;
    iconColor: string;
    onClose: () => void;
    children: React.ReactNode;
    maxHeightPercent?: DimensionValue;
    showsVerticalScrollIndicator?: boolean;
}

export default function ModalSheet({
    title,
    iconName,
    iconColor,
    onClose,
    children,
    maxHeightPercent = '86%',
    showsVerticalScrollIndicator = true,
}: ModalSheetProps) {
    const { colors: T } = useTheme();

    return (
        <View style={[styles.overlay, { backgroundColor: T.overlay }]}>
            <Pressable
                style={StyleSheet.absoluteFill}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Isara ang modal"
            />

            <View
                testID="modal-sheet-v1"
                style={[
                    styles.sheetContainer,
                    {
                        maxHeight: maxHeightPercent,
                        backgroundColor: T.card,
                        borderColor: T.ink,
                    },
                    getNeoShadow(T, 'sm'),
                ]}
            >
                {/* HEADER */}
                <View
                    style={[
                        styles.header,
                        {
                            borderBottomColor: T.border,
                            backgroundColor: T.bg,
                        },
                    ]}
                >
                    <View style={styles.headerTitleArea}>
                        <Ionicons
                            name={iconName as any}
                            size={19}
                            color={iconColor}
                            style={styles.headerIcon}
                        />
                        <Text
                            style={[
                                styles.title,
                                { color: T.text },
                            ]}
                            numberOfLines={1}
                        >
                            {title}
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={onClose}
                        style={[
                            styles.closeBtn,
                            {
                                backgroundColor: T.card,
                                borderColor: T.ink,
                            },
                        ]}
                        activeOpacity={0.72}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Isara"
                    >
                        <Ionicons
                            name="close"
                            size={18}
                            color={T.text}
                        />
                    </TouchableOpacity>
                </View>

                {/* BODY */}
                <ScrollView
                    style={styles.body}
                    contentContainerStyle={styles.bodyContent}
                    showsVerticalScrollIndicator={
                        showsVerticalScrollIndicator
                    }
                >
                    {children}
                </ScrollView>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        paddingHorizontal: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sheetContainer: {
        width: '100%',
        maxWidth: 500,
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.lg,
        overflow: 'hidden',
    },
    header: {
        minHeight: 56,
        paddingHorizontal: 15,
        paddingVertical: 11,
        borderBottomWidth: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitleArea: {
        flex: 1,
        minWidth: 0,
        marginRight: 10,
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerIcon: {
        marginRight: 9,
    },
    title: {
        flex: 1,
        fontSize: 16,
        lineHeight: 21,
        fontWeight: '800',
        letterSpacing: 0.15,
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.md,
        justifyContent: 'center',
        alignItems: 'center',
    },
    body: {
        flex: 1,
    },
    bodyContent: {
        padding: 20,
    },
});
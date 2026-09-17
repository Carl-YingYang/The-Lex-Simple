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

// MODAL SHEET VERSION: 1.0.0
// Same modal structure with sharper visual styling.
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
        <View style={styles.overlay}>
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
                        borderColor: T.border,
                    },
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
                                borderColor: T.border,
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
        backgroundColor: 'rgba(0,0,0,0.72)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sheetContainer: {
        width: '100%',
        maxWidth: 500,
        borderWidth: 1,
        borderRadius: 8,
        overflow: 'hidden',
        elevation: 5,
        shadowColor: '#000000',
        shadowOpacity: 0.18,
        shadowRadius: 7,
        shadowOffset: {
            width: 0,
            height: 4,
        },
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
        borderWidth: 1,
        borderRadius: 6,
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

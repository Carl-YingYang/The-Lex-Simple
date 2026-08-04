import React from 'react';
import { View, ScrollView, TouchableOpacity, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

interface ModalSheetProps {
    title: string;
    iconName: string;
    iconColor: string;
    onClose: () => void;
    children: React.ReactNode;
    maxHeightPercent?: string;
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
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            <View
                style={[
                    styles.sheetContainer,
                    {
                        maxHeight: maxHeightPercent,
                        backgroundColor: T.card,
                        borderColor: T.border
                    }
                ]}
            >
                {/* HEADER */}
                <View style={[styles.header, { borderBottomColor: T.border, backgroundColor: T.bg }]}>
                    <View style={styles.headerTitleArea}>
                        <Ionicons name={iconName as any} size={20} color={iconColor} style={{ marginRight: 10 }} />
                        <Text style={[styles.title, { color: T.text }]} numberOfLines={1}>
                            {title}
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={onClose}
                        style={[styles.closeBtn, { backgroundColor: T.card, borderColor: T.border }]}
                    >
                        <Ionicons name="close" size={18} color={T.text} />
                    </TouchableOpacity>
                </View>

                {/* BODY */}
                <ScrollView
                    style={styles.body}
                    contentContainerStyle={{ padding: 20 }}
                    showsVerticalScrollIndicator={showsVerticalScrollIndicator}
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
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    sheetContainer: {
        width: '100%',
        maxWidth: 500,
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
        elevation: 10,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 10 },
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    headerTitleArea: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 10,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
    },
    body: {
        flex: 1,
    }
});
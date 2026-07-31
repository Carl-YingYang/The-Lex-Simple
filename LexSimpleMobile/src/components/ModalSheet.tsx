import React from 'react';
import { View, ScrollView, TouchableOpacity, Pressable, StyleSheet, Text, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, globalStyles } from '../theme/globalStyles';
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
    const { isDarkMode, colors: T } = useTheme();

    return (
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' }}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            <View
                style={[
                    globalStyles.result_modalCenterBox,
                    {
                        maxHeight: maxHeightPercent,
                        backgroundColor: T.card,
                        borderColor: T.border,
                        borderRadius: 12 // Sharp corner
                    },
                ]}
            >
                {/* HEADER */}
                <View style={[globalStyles.result_modalHeaderArea, { backgroundColor: T.bg, borderBottomColor: T.border }]}>
                    <View style={globalStyles.result_modalHeaderTitleArea}>
                        <Ionicons name={iconName as any} size={20} color={iconColor} style={{ marginRight: 8 }} />
                        <Text style={[globalStyles.result_modalTitleText, { color: T.text }]} numberOfLines={1}>
                            {title}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={globalStyles.detailModal_closeBtn}>
                        <Ionicons name="close" size={18} color={T.text} />
                    </TouchableOpacity>
                </View>

                {/* BODY */}
                <ScrollView
                    style={globalStyles.result_modalBodyArea}
                    showsVerticalScrollIndicator={showsVerticalScrollIndicator}
                >
                    {children}
                </ScrollView>
            </View>
        </View>
    );
}